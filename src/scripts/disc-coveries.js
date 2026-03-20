const MODULE_ID = 'disc-coveries';
const SETTING_KEY = 'artworkConsent';

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name:  'Artwork Consent',
    hint:  'Whether the GM has made an artwork choice for this module.',
    scope: 'world',
    config: false,
    type:  String,
    default: '',
  });
});

Hooks.once('ready', () => {
  if (!game.user.isGM) return;
  if (game.settings.get(MODULE_ID, SETTING_KEY)) return;

  new ArtConsentDialog().render({ force: true });
});

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class ArtConsentDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id:       'disc-coveries-art-consent',
    tag:      'div',
    window: {
      title:       'Disc-coveries – Artwork Options',
      resizable:   false,
      minimizable: false,
    },
    position: {
      width:  500,
      height: 'auto',
    },
    classes: ['disc-coveries', 'art-consent-dialog'],
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/disc-coveries.hbs`,
    },
  };

  async close(options = {}) {
    const choice = game.settings.get(MODULE_ID, SETTING_KEY);
    if (!choice && !options.force) return;
    return super.close(options);
  }

  async _prepareContext(_options) {
    return {};
  }

  _onRender(context, options) {
    super._onRender(context, options);

    this.element
      .querySelector('#dcart-btn-decline')
      ?.addEventListener('click', () => this._onDecline());

    this.element
      .querySelector('#dcart-btn-accept')
      ?.addEventListener('click', () => this._onAccept());
  }

  async _onDecline() {
    await game.settings.set(MODULE_ID, SETTING_KEY, 'declined');
    await this.close({ force: true });
  }

  async _onAccept() {
    await game.settings.set(MODULE_ID, SETTING_KEY, 'accepted');

    // Swap to progress view
    this.element.querySelector('.dcart-options').style.display  = 'none';
    this.element.querySelector('.dcart-progress').style.display = 'flex';

    try {
      await this._downloadAssets();
      this._setStatus('All done! Artwork installed.');
      await new Promise(r => setTimeout(r, 1800));
      await this.close({ force: true });
    } catch (err) {
      console.error(`${MODULE_ID} | Artwork download error:`, err);
      this._setStatus('Something went wrong – check the console (F12) for details.');
    }
  }

  _setStatus(text) {
    const el = this.element.querySelector('.dcart-status');
    if (el) el.textContent = text;
  }

  _setProgress(pct) {
    const el = this.element.querySelector('.dcart-bar-fill');
    if (el) el.style.width = `${pct}%`;
  }

  get _FilePicker() {
    return foundry.applications.apps.FilePicker.implementation;
  }

  async _ensureDirectory(folder) {
    const parts = folder.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      try {
        await this._FilePicker.createDirectory('data', current, { notify: false });
      } catch (err) {
        if (!err.message?.toLowerCase().includes('already')) {
          console.warn(`${MODULE_ID} | Could not create directory "${current}":`, err);
        }
      }
    }
  }

  async _downloadAssets() {
    const MANIFEST_URL =
      'https://raw.githubusercontent.com/tokeidlom/disc-coveries/main/art-manifest.json';

    const manifestResp = await fetch(MANIFEST_URL);
    if (!manifestResp.ok) throw new Error(`Cannot fetch art manifest (${manifestResp.status})`);

    /** @type {{ files: Array<{ url: string, dest: string }> }} */
    const manifest = await manifestResp.json();
    const files    = manifest.files ?? [];
    const total    = files.length;

    const folders = [...new Set(files.map(f => f.dest.substring(0, f.dest.lastIndexOf('/'))))];
    for (const folder of folders) {
      await this._ensureDirectory(folder);
    }

    for (let i = 0; i < total; i++) {
      const { url, dest } = files[i];

      const folder   = dest.substring(0, dest.lastIndexOf('/'));
      const filename = dest.split('/').pop();

      this._setStatus(`Downloading ${i + 1} / ${total}: ${filename}`);

      let blob;
      try {
        const resp = await fetch(url);
        if (!resp.ok) { console.warn(`${MODULE_ID} | Skipping ${url} (${resp.status})`); continue; }
        blob = await resp.blob();
      } catch (fetchErr) {
        console.warn(`${MODULE_ID} | Could not fetch ${url}:`, fetchErr);
        continue;
      }

      const file = new File([blob], filename, { type: blob.type });
      await this._FilePicker.upload('data', folder, file, {}, { notify: false });

      this._setProgress(Math.round(((i + 1) / total) * 100));
    }
  }
}