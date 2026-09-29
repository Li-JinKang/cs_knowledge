// Copy Excalidraw's font files into the site's public/ directory so they are
// served from the same origin as the app.
//
// Why this is necessary: @excalidraw/excalidraw resolves fonts against
// window.EXCALIDRAW_ASSET_PATH, and when that is unset it falls back to
//   https://esm.sh/@excalidraw/excalidraw@<version>/dist/prod/
// The published site must not depend on a third-party CDN it does not control
// (and a blocked CDN means the CJK font silently fails, so Chinese labels fall
// back to whatever the OS has).
//
// Run automatically by `npm run build`; the fonts are also in node_modules, so
// nothing is vendored into git.
//
// Usage: node tools/copy-fonts.mjs

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');

const src = join(siteRoot, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts');
const dest = join(siteRoot, 'public', 'fonts');

if (!existsSync(src)) {
  console.error(`Fonts not found at ${src}. Run \`npm install\` first.`);
  process.exit(1);
}

// Rebuild from scratch so a version bump cannot leave stale subsets behind.
if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

function summarise(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = summarise(p);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(p).size;
    }
  }
  return { files, bytes };
}

const { files, bytes } = summarise(dest);
console.log(`copied ${files} font files (${(bytes / 1024 / 1024).toFixed(1)} MB) -> public/fonts`);
