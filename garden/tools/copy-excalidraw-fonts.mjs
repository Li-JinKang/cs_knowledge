// 把 Excalidraw 的字体复制到站点里，供画布运行时按需加载。
//
// 为什么不能走 CDN：@excalidraw/excalidraw 默认从 esm.sh 取字体，而中文
// 手写体（Xiaolai）有 13 MB 的子集，被墙或超时就会静默回退到系统字体，
// 画布上的中文标签会变成另一个样子。
//
// 产物 src/site/fonts/ 由 .eleventy.js 的 addPassthroughCopy 映射到 /fonts/，
// 页面脚本把 window.EXCALIDRAW_ASSET_PATH 设成 '/'，Excalidraw 就会来这里取。
//
// Usage: node tools/copy-excalidraw-fonts.mjs

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const src = join(root, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts');
const dest = join(root, 'src', 'site', 'fonts');

if (!existsSync(src)) {
  console.error(`找不到字体：${src}\n先运行 npm install。`);
  process.exit(1);
}

// 从零重建，避免版本升级后留下过期的子集。
rmSync(dest, { recursive: true, force: true });
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
console.log(`复制了 ${files} 个字体文件（${(bytes / 1024 / 1024).toFixed(1)} MB）-> src/site/fonts`);
