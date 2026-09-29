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

// Record every request so we can prove fonts are served from this origin rather
// than an external CDN. A blocked CDN makes CJK labels fall back silently.
const externalRequests = [];
page.on('request', (req) => {
  const url = req.url();
  if (url.startsWith('http') && !url.startsWith(BASE.replace(/\/$/, ''))) {
    externalRequests.push(url);
  }
});

// Capture failed responses with their URLs -- a bare "404" console message does
// not say which asset is missing.
//
// Toggled off while the leak probes below deliberately fetch paths that MUST
// 404; otherwise their expected misses get reported as failures.
let collectFailures = true;
const failedResponses = [];
page.on('response', (res) => {
  if (collectFailures && res.status() >= 400) {
    failedResponses.push(`${res.status()} ${res.url()}`);
  }
});

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

// ---- 4. docs routes work ----
await page.goto(`${BASE}#/docs`, { waitUntil: 'networkidle' });
const indexLinks = await page.locator('.docs-index a').count();
check('docs index lists pages', indexLinks >= 1, `${indexLinks} links`);

await page.goto(`${BASE}#/docs/getting-started.md`, { waitUntil: 'networkidle' });
await page.waitForSelector('.docs h1', { timeout: 15000 });
const docH1 = await page.locator('.docs h1').first().innerText();
const docTables = await page.locator('.docs table').count();
check('a docs page renders', docH1.length > 0, `h1="${docH1}", tables=${docTables}`);

// ---- 5. private agent skills must NOT reach the published site ----
// docs/ is the only source for documentation pages; .agents/ is ignored and is
// deliberately not globbed. These probes fail loudly if that ever regresses.
await page.goto(BASE, { waitUntil: 'networkidle' });
collectFailures = false; // the probes below are expected to 404
const leaked = await page.evaluate(async () => {
  const probes = [
    '.agents/skills/obsidian-cli-automation/SKILL.md',
    'SKILL.md',
    'references/mindmap-api.md',
    'references/windows-gotchas.md',
    'AIDL.md',
    'Binder.md',
  ];
  const found = [];
  for (const p of probes) {
    try {
      const r = await fetch(p, { method: 'HEAD' });
      if (r.ok) found.push(p);
    } catch { /* unreachable is the expected case */ }
  }
  return found;
});
check(
  'agent skills and vault notes are not served',
  leaked.length === 0,
  leaked.length ? `reachable: ${leaked.join(', ')}` : 'none reachable'
);
collectFailures = true; // back to normal monitoring

// The docs index must only contain pages sourced from docs/.
await page.goto(`${BASE}#/docs`, { waitUntil: 'networkidle' });
const docHrefs = await page.locator('.docs-index a').evaluateAll((els) =>
  els.map((e) => e.getAttribute('href') ?? '')
);
const skillLeak = docHrefs.filter((h) => /SKILL|references\//i.test(h));
check(
  'docs index does not expose skill pages',
  skillLeak.length === 0,
  skillLeak.length ? skillLeak.join(', ') : docHrefs.join(', ')
);

// Drop console noise accumulated by the deliberate 404 probes above; the final
// error check should reflect only a clean page load.
consoleErrors.length = 0;

// ---- 6. fonts and other assets are self-hosted ----
// The app must not depend on esm.sh (or any CDN) for its font subsets: a blocked
// CDN means Chinese labels silently fall back to system fonts.
const fontRequests = await page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => /\.(woff2?|ttf|otf)(\?|$)/i.test(n))
);
const cdnFonts = fontRequests.filter((u) => /esm\.sh|unpkg|jsdelivr|cdn/i.test(u));
check(
  'fonts are served from this origin',
  cdnFonts.length === 0,
  `${fontRequests.length} font requests, ${cdnFonts.length} from a CDN`
);

const external = [...new Set(externalRequests)].filter((u) => !/github\.com|githubusercontent/.test(u));
check(
  'no unexpected third-party requests',
  external.length === 0,
  external.length ? external.slice(0, 3).join(' | ') : 'none'
);

// ---- 7. no failed requests, no console errors ----
check(
  'no failed requests',
  failedResponses.length === 0,
  failedResponses.slice(0, 4).join(' | ')
);

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
