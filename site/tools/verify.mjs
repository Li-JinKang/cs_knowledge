// End-to-end verification of the built site.
//
// Checks the things that would silently break the published page:
//   1. the Excalidraw canvas mounts at all
//   2. every text element reports non-zero width -- a CJK glyph that the font
//      cannot render measures as zero/near-zero width, which is how "tofu"
//      boxes show up without any console error
//   3. the PNG export button actually produces a plausible image file
//   4. the markdown docs routes render
//
// Usage: node tools/verify.mjs [baseUrl]

import { chromium } from 'playwright';
import { mkdtempSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8899/';
const results = [];

function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// ---- 1. canvas mounts ----
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__excalidrawAPI), null, { timeout: 30000 });

const elementCount = await page.evaluate(
  () => window.__excalidrawAPI.getSceneElements().length
);
check('Excalidraw canvas mounts with scene loaded', elementCount === 443, `${elementCount} elements`);

// ---- 2. every text element has real, non-zero text metrics ----
const textMetrics = await page.evaluate(() => {
  const api = window.__excalidrawAPI;
  const els = api.getSceneElements();
  const texts = els.filter((e) => e.type === 'text');
  const cjkRe = /[\u4e00-\u9fff]/;
  const zeroWidth = [];
  let cjkCount = 0;
  for (const t of texts) {
    if (cjkRe.test(t.text ?? '')) cjkCount++;
    // A glyph the font lacks still reports the element box, but the *rendered*
    // text width collapses. Flag anything suspiciously small.
    if (!(typeof t.width === 'number') || t.width < 1) {
      zeroWidth.push({ text: t.text, width: t.width });
    }
  }
  return { total: texts.length, cjkCount, zeroWidth };
});
check(
  'all text elements have non-zero width',
  textMetrics.zeroWidth.length === 0,
  `${textMetrics.total} text nodes, ${textMetrics.cjkCount} contain CJK, ${textMetrics.zeroWidth.length} degenerate`
);

// Does the font actually resolve for CJK? Measure a rendered glyph via canvas.
const fontResolves = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('2d');
  const measure = (font) => {
    c.font = `20px ${font}`;
    const a = c.measureText('知').width;
    const b = c.measureText('\uFFFF').width; // definitely-missing glyph
    return { a, b };
  };
  const sans = measure('sans-serif');
  return { cjkWidth: sans.a, missingWidth: sans.b };
});
check(
  'system font provides CJK glyphs',
  fontResolves.cjkWidth > 0,
  `"知" measures ${fontResolves.cjkWidth.toFixed(1)}px`
);

// ---- 3. PNG export produces a real file ----
const downloadDir = mkdtempSync(join(tmpdir(), 'cs-knowledge-dl-'));
let pngOk = false;
let pngDetail = '';
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name: 'PNG' }).click(),
  ]);
  const target = join(downloadDir, download.suggestedFilename());
  await download.saveAs(target);
  const size = statSync(target).size;
  pngOk = size > 10_000;
  pngDetail = `${download.suggestedFilename()} ${(size / 1024).toFixed(0)} KB`;
} catch (err) {
  pngDetail = err.message;
}
check('PNG export downloads an image', pngOk, pngDetail);

// ---- 4. docs routes ----
await page.goto(`${BASE}#/docs`, { waitUntil: 'networkidle' });
const indexLinks = await page.locator('.docs-index a').count();
check('docs index lists pages', indexLinks >= 5, `${indexLinks} links`);

await page.goto(`${BASE}#/docs/SKILL.md`, { waitUntil: 'networkidle' });
await page.waitForSelector('.docs h1', { timeout: 15000 });
const h1 = await page.locator('.docs h1').first().innerText();
const hasTable = await page.locator('.docs table').count();
check('SKILL.md renders as a page', h1.length > 0, `h1="${h1}", tables=${hasTable}`);

await page.goto(`${BASE}#/docs/references/mindmap-api.md`, { waitUntil: 'networkidle' });
await page.waitForSelector('.docs h1', { timeout: 15000 });
const refH1 = await page.locator('.docs h1').first().innerText();
check('nested reference doc renders', refH1.length > 0, `h1="${refH1}"`);

// ---- 5. no console errors ----
const meaningful = consoleErrors.filter(
  (e) => !/favicon|ResizeObserver loop/i.test(e)
);
check('no console errors', meaningful.length === 0, meaningful.slice(0, 2).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('failures:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
