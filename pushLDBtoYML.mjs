
import { extractPack } from '@foundryvtt/foundryvtt-cli';
import { promises as fs } from 'fs';
import path from 'path';
import YAML from 'yaml';

const yaml = true;
const expandAdventures = true;
const folders = true;

const packs = await fs.readdir('./src/packs');

for (const pack of packs) {
  if (pack.startsWith('.')) continue;

  console.log('Unpacking ' + pack);

  await extractPack(
    `./src/packs/${pack}`,
    `./packs/${pack}`,
    {
      yaml,
      transformName,
      expandAdventures,
      folders,
      clean: true
    }
  );

  if (expandAdventures && yaml && folders) {
    await fixAdventurePaths(`./packs/${pack}`);
  }
}

function transformName(doc, context) {
  const safeFileName = doc.name.replace(/[^a-zA-Z0-9А-я]/g, '_');
  const prefix = ['Actor', 'Item'].includes(context.documentType)
    ? doc.type
    : context.documentType;

  let name = `${
    doc.name ? `${prefix}_${safeFileName}_${doc._id}` : doc._id
  }.${yaml ? 'yml' : 'json'}`;

  if (context.folder) name = path.join(context.folder, name);

  return name;
}

async function fixAdventurePaths(root) {
  const adventurePathLists = [
    'actors',
    'items',
    'journal',
    'scenes',
    'tables',
    'playlists',
    'macros',
    'cards',
    'folders'
  ];

  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!/^Adventure_.*\.yml$/i.test(entry.name)) continue;

      const content = await fs.readFile(fullPath, 'utf8');
      const adventure = YAML.parse(content);

      if (!adventure || typeof adventure !== 'object') {
        console.warn(`Skipping invalid Adventure YAML: ${fullPath}`);
        continue;
      }

      const adventureFolder = entry.name
        .replace(/^Adventure_/, '')
        .replace(/\.yml$/i, '');
      let changed = false;

      for (const key of adventurePathLists) {
        const paths = adventure[key];

        if (!Array.isArray(paths)) continue;

        adventure[key] = paths.map((value) => {
          if (typeof value !== 'string') return value;

          // Already prefixed: leave unchanged.
          if (value.startsWith(`${adventureFolder}/`)) return value;

          // Prefix only relative paths, not absolute paths or URLs.
          if (
            value.startsWith('/') ||
            /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
          ) {
            return value;
          }

          changed = true;
          return `${adventureFolder}/${value.replace(/\\/g, '/')}`;
        });
      }

      if (changed) {
        await fs.writeFile(
          fullPath,
          YAML.stringify(adventure),
          'utf8'
        );

        console.log(`Fixed Adventure paths: ${fullPath}`);
      } else {
        console.log(`No path changes needed: ${fullPath}`);
      }
    }
  }

  await walk(root);
}