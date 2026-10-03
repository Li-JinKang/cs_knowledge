// 把 .excalidraw.md 变成站点里可看的 Excalidraw 画布。
//
// Obsidian 的 Excalidraw 把整个画布存在 ```compressed-json 代码块里（lz-string
// base64）。Digital Garden 不认识这个格式，直接发布会退化成一堆文本元素。
// 这里在构建期把它解压成场景 JSON，并把这一页的正文换成挂载点，由站点运行时
// 用 Excalidraw 自己的渲染器画出来。
//
// 产出：
//   src/site/scenes/<名字>.json     解压后的场景
//   src/site/notes/**/<名字>.md     正文换成挂载点（frontmatter 原样保留）
//
// Usage: node tools/dg-excalidraw.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import LZString from 'lz-string';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const NOTES = join(root, 'src/site/notes');
const SCENES = join(root, 'src/site/scenes');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** 从 .excalidraw.md 里取出场景。已经是挂载点形式的文件返回 null。 */
function extractScene(md) {
  const m = md.match(/```compressed-json\s*\n([\s\S]*?)\n```/);
  if (!m) return null;
  const json = LZString.decompressFromBase64(m[1].replace(/\s+/g, ''));
  if (!json) return null;
  const scene = JSON.parse(json);
  return {
    type: 'excalidraw',
    version: scene.version ?? 2,
    elements: (scene.elements ?? []).filter((el) => !el.isDeleted),
    appState: scene.appState ?? {},
    files: scene.files ?? {},
  };
}

/** 扫描笔记，建立「文件名 -> 站点永久链接」的映射，用于把画布里的 wikilink 翻成 URL。 */
function buildPermalinkMap() {
  const map = new Map();
  for (const file of walk(NOTES).filter((f) => f.endsWith('.md'))) {
    const src = readFileSync(file, 'utf8');
    const m = src.match(/^permalink:\s*(.+?)\s*$/m);
    const name = basename(file).replace(/\.md$/, '');
    if (m) map.set(name, m[1]);
    if (name.endsWith('.excalidraw')) map.set(name.replace(/\.excalidraw$/, ''), m ? m[1] : undefined);
  }
  return map;
}

/**
 * Obsidian 的 Excalidraw 把文本里的 wikilink 存在 rawText 上（hasTextLink: true），
 * Excalidraw 本体不认这个字段，所以网页上点不动。这里把它翻成元素自己的 link。
 */
function resolveTextLinks(scene, permalinks) {
  let linked = 0;
  let dead = 0;
  const wikilinks = [];
  for (const el of scene.elements) {
    const raw = el.rawText;
    if (typeof raw !== 'string') continue;
    const m = raw.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/);
    if (!m) continue;
    const target = m[1].trim();
    const url = permalinks.get(target.split('/').pop());
    if (url) {
      el.link = url;
      linked += 1;
      const display = el.text || target.split('/').pop();
      wikilinks.push(`${url.replace(/^\/notes\//, '').replace(/\/$/, '')}|${display}`);
    } else {
      dead += 1;
    }
  }
  return { linked, dead, wikilinks };
}

function mountBody(name, wikilinks = []) {
  const sceneUrl = `/scenes/${encodeURIComponent(name)}.json`;
  // 画布由 JS 渲染，正文里没有链接，关系图谱就看不到画布指向谁。
  // HTML 注释既能被图谱的正文正则匹配到，又不会显示出来。
  const linkComment =
    wikilinks.length > 0
      ? `\n<!-- 画布里的跳转，供关系图谱解析\n${wikilinks.map((w) => `[[${w}]]`).join('\n')}\n-->\n`
      : '';
  return `
<link rel="stylesheet" href="/plugins/dg-excalidraw/style.css">
<div class="dg-excalidraw-root" id="dg-excalidraw-root"></div>
<script>
  // 画布从左侧文件树的右边缘开始铺满，宽度按实际布局量，避免写死偏移。
  (function () {
    var el = document.getElementById('dg-excalidraw-root');
    var main = document.querySelector('main.content');
    if (el && main) el.style.left = Math.round(main.getBoundingClientRect().left) + 'px';
  })();
</script>
<script>window.EXCALIDRAW_ASSET_PATH = '/';</script>
<script src="/plugins/dg-excalidraw/viewer.js"></script>
<script>
  fetch(${JSON.stringify(sceneUrl)})
    .then(function (r) { return r.json(); })
    .then(function (scene) {
      window.DGExcalidraw.mount(document.getElementById('dg-excalidraw-root'), scene);
    });
</script>
${linkComment}`;
}

function main() {
  if (!existsSync(join(root, 'src/site/plugins/dg-excalidraw/viewer.js'))) {
    console.error('缺少 src/site/plugins/dg-excalidraw/viewer.js');
    process.exit(1);
  }
  const notes = walk(NOTES).filter((f) => f.endsWith('.excalidraw.md'));
  if (notes.length === 0) {
    console.log('没有 .excalidraw.md，跳过');
    return;
  }

  mkdirSync(SCENES, { recursive: true });
  const permalinks = buildPermalinkMap();
  let done = 0;

  for (const file of notes) {
    const name = basename(file).replace(/\.md$/, ''); // 思维导图.excalidraw
    const src = readFileSync(file, 'utf8');
    const scene = extractScene(src);

    if (!scene) {
      // 已经处理过（正文是挂载点）。场景 JSON 可能被删了，重建一份无从下手，
      // 所以只提示，不报错。
      console.log(`  跳过 ${name}（没有 compressed-json 块）`);
      continue;
    }

    const links = resolveTextLinks(scene, permalinks);
    writeFileSync(join(SCENES, `${name}.json`), JSON.stringify(scene), 'utf8');

    const fmEnd = src.startsWith('---\n') ? src.indexOf('\n---', 4) + 4 : 0;
    const frontmatter = src.slice(0, fmEnd);
    writeFileSync(file, frontmatter + mountBody(name, links.wikilinks), 'utf8');

    done += 1;
    console.log(
      `  ${name} -> scenes/${name}.json（${scene.elements.length} 个元素，` +
        `${links.linked} 个可跳转链接，${links.dead} 个指向不存在的笔记）`
    );
  }

  console.log(`处理完成：${done}/${notes.length}`);
}

main();
