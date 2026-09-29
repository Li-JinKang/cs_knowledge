// Confirm the Obsidian Excalidraw plugin's `compressed-json` format.
//
// Evidence from the plugin bundle (main.js) showed it calls
//   decompressFromBase64 -> LZString._decompress(len, 32, ...)
// i.e. lz-string's base64 variant, with bitsPerChar=32 -> UTF-16 output.
//
// This script proves that hypothesis against the real file.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LZString = require('lz-string');

const input = process.argv[2] ?? 'F:/StudyReview/Android/思维导图.excalidraw.md';
const output = process.argv[3] ?? 'src/scene.json';

const raw = readFileSync(input, 'utf8');
const match = raw.match(/```compressed-json\s*\n([\s\S]*?)\n```/);
if (!match) {
  console.error('No ```compressed-json block found:', input);
  process.exit(1);
}
const payload = match[1].replace(/\s+/g, '');

// lz-string's base64 variant; the plugin passes bitsPerChar 32, which yields a
// UTF-16 string. decompressFromBase64 is the documented entry point for it.
const json = LZString.decompressFromBase64(payload);

if (!json) {
  console.error('lz-string returned null -- payload is not lz-string base64.');
  process.exit(1);
}

const scene = JSON.parse(json);
const elements = Array.isArray(scene.elements) ? scene.elements : [];
const census = elements.reduce((a, el) => {
  a[el.type] = (a[el.type] ?? 0) + 1;
  return a;
}, {});

console.log(`decompressed: ${json.length} chars`);
console.log(`scene type: ${scene.type}, version: ${scene.version}`);
console.log(`elements: ${elements.length}`);
console.log(`types: ${JSON.stringify(census)}`);
console.log(`files: ${Object.keys(scene.files ?? {}).length}`);

// Excalidraw will not render deleted elements.
const live = elements.filter((el) => !el.isDeleted);
if (live.length !== elements.length) {
  console.log(`dropped ${elements.length - live.length} deleted elements`);
}

const out = {
  type: 'excalidraw',
  version: scene.version ?? 2,
  elements: live,
  appState: {
    viewBackgroundColor: scene.appState?.viewBackgroundColor ?? '#ffffff',
    gridSize: scene.appState?.gridSize ?? null,
  },
  files: scene.files ?? {},
};

writeFileSync(output, JSON.stringify(out, null, 2), 'utf8');
console.log(`\nwrote ${output} (${live.length} elements)`);
