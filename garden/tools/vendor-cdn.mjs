// 把 garden 模板依赖的所有 CDN 资源抓到本地 src/site/vendor/。
//
// 为什么必须做：Digital Garden 模板把关系图谱（d3 + Pixi）、搜索（flexsearch）、
// 代码高亮（prism）、Mermaid、侧栏交互（alpine）、图标（lucide）全都挂在
// jsdelivr / cdnjs / unpkg 上。这些域名在国内经常不通，站点会是残废的。
//
// 用法（在 garden 仓库根目录）：
//   node tools/vendor-cdn.mjs
//
// 抓完之后还要把模板里的引用改成本地路径，见 fragments/ 下的文件；
// 这个脚本最后会自检一遍有没有漏网的外链。
//
// 注意：d3 和 mermaid 不能简单下载单个文件 ——
//   * jsdelivr 的 d3 `+esm` 用根相对路径 /npm/<pkg>@<ver>/+esm 引依赖，必须递归抓
//     并把路径改写成相对路径，否则运行时全是 404。
//   * mermaid 的 ESM 入口在运行时按图表类型动态拼 chunk 路径，静态分析追不到，
//     只能把包内 chunks/ 全量拉下来（约 20 MB；入口只有 30 KB，其余按需加载）。

import { mkdir, writeFile, readFile, readdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const VENDOR = 'src/site/vendor';
const UA = { 'user-agent': 'digital-garden-vendor/1.0' };

async function get(url, { json = false } = {}) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return json ? res.json() : Buffer.from(await res.arrayBuffer());
}

async function save(rel, data) {
  const dst = join(VENDOR, rel);
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, data);
}

// ---------------------------------------------------------------- 单文件资源
const SINGLES = {
  'pixi.min.js': 'https://cdn.jsdelivr.net/npm/pixi.js@7.4.2/dist/pixi.min.js',
  'flexsearch.bundle.js': 'https://cdn.jsdelivr.net/npm/flexsearch@0.7.21/dist/flexsearch.bundle.js',
  'luxon.min.js': 'https://fastly.jsdelivr.net/npm/luxon@3.2.1/build/global/luxon.min.js',
  'alpine/alpine.min.js': 'https://fastly.jsdelivr.net/npm/alpinejs@3.11.1/dist/cdn.min.js',
  'alpine/persist.min.js': 'https://fastly.jsdelivr.net/npm/@alpinejs/persist@3.11.1/dist/cdn.min.js',
  'prism/prism.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.25.0/prism.min.js',
  'prism/prism-autoloader.min.js':
    'https://cdnjs.cloudflare.com/ajax/libs/prism/1.25.0/plugins/autoloader/prism-autoloader.min.js',
  'prism/prism-okaidia.min.css':
    'https://cdnjs.cloudflare.com/ajax/libs/prism/1.25.0/themes/prism-okaidia.min.css',
};

// prism 的语言包，按需增删。autoloader 会在页面里遇到没加载的语言时来这个目录取。
const PRISM_LANGS = [
  'kotlin', 'bash', 'java', 'json', 'yaml', 'markdown',
  'python', 'sql', 'properties', 'docker', 'groovy', 'c', 'cpp',
];

// ------------------------------------------------------------------- d3 系列
const D3_ENTRIES = [
  ['d3-force', 'd3-force@3.0.0'],
  ['d3-selection', 'd3-selection@3.0.0'],
  ['d3-zoom', 'd3-zoom@3.0.0'],
  ['d3-drag', 'd3-drag@3.0.0'],
];

async function vendorD3() {
  // jsdelivr 的 +esm 产物把依赖写成根相对路径 /npm/<pkg>@<ver>/+esm，递归抓全。
  const specRe = /["']\/npm\/([^"']+?\/\+esm)["']/g;
  const smRe = /\/\/# sourceMappingURL=\S*/g;
  const fname = (spec) => spec.replace('/+esm', '').replace('@', '_') + '.js';

  const queue = D3_ENTRIES.map(([, spec]) => `${spec}/+esm`);
  const seen = new Set(queue);
  const files = new Map();

  while (queue.length) {
    const spec = queue.shift();
    const text = (await get(`https://cdn.jsdelivr.net/npm/${spec}`)).toString('utf8');
    files.set(spec, text);
    for (const m of text.matchAll(specRe)) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        queue.push(m[1]);
      }
    }
  }

  for (const [spec, text] of files) {
    const rewritten = text.replace(smRe, '').replace(specRe, (_, s) => `"./${fname(s)}"`);
    await save(`d3/${fname(spec)}`, rewritten);
  }
  // import map 里用的是不带版本号的名字，额外存一份入口别名
  for (const [alias, spec] of D3_ENTRIES) {
    await save(`d3/${alias}.js`, await readFile(join(VENDOR, 'd3', fname(`${spec}/+esm`))));
  }
  return files.size;
}

// ------------------------------------------------------------------- mermaid
async function vendorMermaid() {
  const { version } = await get(
    'https://data.jsdelivr.com/v1/packages/npm/mermaid/resolved?specifier=11',
    { json: true }
  );
  await save('mermaid/mermaid.esm.min.mjs', await get(
    `https://cdn.jsdelivr.net/npm/mermaid@${version}/dist/mermaid.esm.min.mjs`
  ));

  const tree = await get(`https://data.jsdelivr.com/v1/packages/npm/mermaid@${version}?structure=flat`, {
    json: true,
  });
  const chunks = tree.files
    .map((f) => f.name)
    .filter((n) => n.startsWith('/dist/chunks/mermaid.esm.min/'));

  for (const c of chunks) {
    const rel = c.slice('/dist/'.length);
    await save(`mermaid/${rel}`, await get(`https://cdn.jsdelivr.net/npm/mermaid@${version}/dist/${rel}`));
  }
  return { version, chunks: chunks.length };
}

// ---------------------------------------------------------------------- 主流程
async function main() {
  if (existsSync(VENDOR)) await rm(VENDOR, { recursive: true, force: true });
  await mkdir(VENDOR, { recursive: true });

  console.log('单文件资源…');
  for (const [rel, url] of Object.entries(SINGLES)) {
    await save(rel, await get(url));
    console.log(`  ${rel}`);
  }

  console.log('lucide 图标…');
  const { version: lucideVer } = await get('https://registry.npmjs.org/lucide/latest', { json: true });
  await save('lucide.min.js', await get(`https://unpkg.com/lucide@${lucideVer}/dist/umd/lucide.min.js`));
  console.log(`  lucide.min.js (${lucideVer})`);

  console.log('prism 语言包…');
  for (const l of PRISM_LANGS) {
    try {
      await save(`prism/components/prism-${l}.min.js`, await get(
        `https://cdnjs.cloudflare.com/ajax/libs/prism/1.25.0/components/prism-${l}.min.js`
      ));
      console.log(`  prism-${l}`);
    } catch {
      console.log(`  prism-${l} 不存在，跳过`);
    }
  }

  console.log('d3（递归抓传递依赖）…');
  console.log(`  ${await vendorD3()} 个文件`);

  console.log('mermaid（含全部 chunk，会慢一点）…');
  const m = await vendorMermaid();
  console.log(`  mermaid ${m.version}，${m.chunks} 个 chunk`);

  // --------------------------------------------------------------- 自检
  const bad = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        const t = await readFile(p, 'utf8').catch(() => '');
        if (/cdn\.jsdelivr|cdnjs\.cloudflare|fastly\.jsdelivr|unpkg\.com|esm\.sh/.test(t)) bad.push(p);
        if (/["']\/npm\//.test(t)) bad.push(p + '  (仍是根相对 /npm/ 引用)');
      }
    }
  };
  await walk(VENDOR);

  const [{ files, bytes }] = await Promise.all([count(VENDOR)]);
  console.log(`\n完成：${files} 个文件，${(bytes / 1024 / 1024).toFixed(1)} MB`);
  if (bad.length) {
    console.error('自检失败，以下文件仍指向外部：');
    bad.forEach((b) => console.error('  ' + b));
    process.exit(1);
  }
  console.log('自检通过：vendor/ 里没有任何外部域名引用');
}

async function count(dir) {
  let files = 0;
  let bytes = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await count(p);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += (await stat(p)).size;
    }
  }
  return { files, bytes };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
