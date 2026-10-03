// 端到端验证：用真实浏览器起一遍站点，检查那些「构建成功但页面是坏的」的点。
//
// 这个脚本抓出过两个真实事故，都是构建日志里完全看不出来的：
//   1. d3 的 jsdelivr +esm 产物内部用根相对路径引传递依赖 —— 单独下载那 4 个
//      文件、静态扫描都干净，运行时图谱全是 404。
//   2. Eleventy 默认读 .gitignore —— 笔记被 gitignore 后构建「成功」，
//      但整站一篇笔记都没有。
//
// 所以别只靠 grep 判断依赖问题，跑这个。
//
// Usage:
//   cd garden && npm run build && npm run verify
//   npm run verify -- https://你的站点.pages.dev/     # 直接验线上
//
// 需要系统装了 Chrome（用 channel: 'chrome'，不另外下载浏览器）。

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gardenRoot = resolve(here, '..');
const DIST = join(gardenRoot, 'dist');

// 传了地址就验线上，否则起本地服务器验 dist/
const targetUrl = process.argv[2];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
};

function serve() {
  const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let file = join(DIST, p);
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
    } catch {
      /* 交给下面的 404 */
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
}

async function main() {
  const { chromium } = await import('playwright-core');

  let server = null;
  let base = targetUrl;
  if (base) {
    base = base.replace(/\/$/, '');
    console.log(`验证线上站点：${base}\n`);
  } else {
    if (!existsSync(DIST)) {
      console.error('找不到 dist/，先跑 npm run build');
      process.exit(1);
    }
    server = await serve();
    base = `http://127.0.0.1:${server.address().port}`;
  }

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

  // 允许的域名从被测地址推导：验本地时是 127.0.0.1，验线上时是站点自己的域名
  const ownHost = new URL(base).hostname;
  const external = new Set();
  const failed = [];
  const errors = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== ownHost) external.add(u.origin);
  });
  page.on('response', (r) => {
    // 主题（Red-Graphite）引用了几个它自己没带的字体，404 无害，回落系统字体
    if (r.status() >= 400 && !/\.(woff2?|ttf|otf)(\?|$)/.test(r.url())) {
      failed.push(r.status() + ' ' + r.url().replace(base, ''));
    }
  });
  page.on('pageerror', (e) => errors.push(e.message));

  // 一篇带代码块和 mermaid 的笔记
  await page.goto(`${base}/notes/docs/android/%E5%9B%9B%E5%A4%A7%E7%BB%84%E4%BB%B6/Service%20%E5%90%AF%E5%8A%A8%E6%96%B9%E5%BC%8F/`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(4500);

  const note = await page.evaluate(() => ({
    pixi: typeof PIXI !== 'undefined' ? PIXI.VERSION : null,
    graphCanvas: document.querySelectorAll('.graph canvas').length,
    lucide: document.querySelectorAll('svg.lucide').length,
    alpine: typeof window.Alpine !== 'undefined',
    prism: typeof window.Prism !== 'undefined',
    flexsearch: typeof window.FlexSearch !== 'undefined',
    tokens: document.querySelectorAll('pre code .token').length,
    sidebar: !!document.querySelector('.sidebar, aside'),
  }));

  check('第三方库全部本地化加载', !!(note.pixi && note.prism && note.flexsearch && note.alpine), `pixi ${note.pixi}`);
  check('关系图谱渲染出 canvas', note.graphCanvas > 0, `${note.graphCanvas} 个`);
  check('lucide 图标渲染', note.lucide > 0, `${note.lucide} 个`);
  check('代码高亮生效', note.tokens > 0, `${note.tokens} 个 token`);
  check('侧栏（大纲 / 反链）存在', note.sidebar);

  // 关系图谱的数据
  await page.goto(base + '/graph.json', { waitUntil: 'networkidle' });
  const graph = await page.evaluate(() => {
    try {
      return JSON.parse(document.body.innerText);
    } catch {
      return null;
    }
  });
  const edges = graph ? Object.values(graph.nodes).reduce((a, n) => a + (n.neighbors || []).length, 0) / 2 : 0;
  check('关系图谱有边（wikilink 解析成功）', edges > 0, `${Object.keys(graph?.nodes ?? {}).length} 节点 / ${edges} 边`);

  // Excalidraw 画布页
  await page.goto(`${base}/notes/Android/%E6%80%9D%E7%BB%B4%E5%AF%BC%E5%9B%BE.excalidraw/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  const canvas = await page.evaluate(() => ({
    mounted: !!document.querySelector('.excalidraw'),
    canvases: document.querySelectorAll('canvas').length,
    bleed: !!document.querySelector('.dg-excalidraw-root'),
  }));
  check('Excalidraw 画布挂载', canvas.mounted, `${canvas.canvases} 个 canvas`);
  check('画布铺满左侧列表右边', canvas.bleed);

  // 全局断言
  check('没有任何外部域名请求', external.size === 0, external.size ? [...external].join(', ') : '零');
  check('没有失败请求', failed.length === 0, failed.length ? [...new Set(failed)].join(', ') : '零');
  check('没有 JS 运行时错误', errors.length === 0, errors.length ? errors[0].slice(0, 120) : '零');

  await browser.close();
  if (server) server.close();

  const bad = results.filter((r) => !r.pass);
  console.log(`\n${results.length - bad.length}/${results.length} 项通过`);
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
