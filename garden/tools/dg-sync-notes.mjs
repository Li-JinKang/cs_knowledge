// 把仓库根的 notes/（Obsidian 库，唯一真相源）同步进 garden 的笔记目录。
//
// 为什么需要它：garden 是 Digital Garden 模板，它规定笔记必须住在
// src/site/notes/ 里。而我们的库在仓库根的 notes/。与其维护一份手工拷贝的
// 副本（会不同步、会忘记更新），不如每次构建现取。
//
// 于是：
//   notes/                      唯一真相源，你只在这里写笔记
//   garden/src/site/notes/      构建期生成，.gitignore 掉，不进仓库
//
// 模板自己的两个文件（notes.json / notes.11tydata.js）就住在这个目录里，
// 同步时会保留它们，其余全部重建 —— 所以删掉的笔记会真的从站点上消失。
//
// 后面的 tools/dg-notes.mjs 和 tools/dg-excalidraw.mjs 会就地加工这里的副本
// （补 permalink、重写链接、解压画布），源库 notes/ 不受任何影响。
//
// Usage: node tools/dg-sync-notes.mjs（由 npm run build 的 prebuild 自动调用）

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gardenRoot = resolve(here, '..');
const source = resolve(gardenRoot, '..', 'notes');
const target = join(gardenRoot, 'src/site/notes');

// 模板自己的文件，住在笔记目录里，不能被同步清掉
const KEEP = new Set(['notes.json', 'notes.11tydata.js']);

// 不发布到站点的目录。Excalidraw/ 放的是插件脚本（Mindmap Builder 等），
// 属于工具而不是知识笔记，发上去只是噪音。要一起发布就把这行清空。
const SKIP_DIRS = new Set(['Excalidraw']);

if (!existsSync(source)) {
  console.error(`找不到笔记源目录：${source}`);
  console.error('这个脚本假设 garden/ 和 notes/ 是同一个仓库下的兄弟目录。');
  process.exit(1);
}

mkdirSync(target, { recursive: true });

// 先清空（保留模板文件），保证在库那边删掉的笔记不会残留在站点上
for (const entry of readdirSync(target)) {
  if (KEEP.has(entry)) continue;
  rmSync(join(target, entry), { recursive: true, force: true });
}

let files = 0;

function sync(from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    // 点开头的都不搬：.obsidian（编辑器配置）、.trash、以及各种临时文件
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

    const src = join(from, entry.name);
    const dst = join(to, entry.name);

    if (entry.isDirectory()) {
      mkdirSync(dst, { recursive: true });
      sync(src, dst);
    } else if (entry.isFile()) {
      cpSync(src, dst);
      files += 1;
    }
  }
}

sync(source, target);

console.log(`同步笔记：${files} 个文件  ${source} -> ${target}`);
