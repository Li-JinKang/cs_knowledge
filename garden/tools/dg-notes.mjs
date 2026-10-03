// 让「在 Obsidian 里正常写笔记」就能直接发布。
//
// Digital Garden 模板对笔记有两个隐含要求，不满足就会静默出问题：
//
//   1. 每篇笔记必须有 permalink。模板的回退值是 /notes/<slugify(路径)>，而
//      slugify 会把中文字符全部丢掉，于是 docs/android/四大组件/APP 启动过程详解
//      变成 /notes/docs-android-app，页面直接 404。真实使用是 Obsidian 插件
//      发布时写进去的，手工搬运没有这一步。
//
//   2. 链接必须是 [[路径|显示名]] 形式。模板的 wikiLinkRegex 是
//      /\[\[(.*?\|.*?)\]\]/g，只认带竖线的；而 Obsidian 默认的「最短路径」
//      写出来是 [[Service 前台服务]]，于是关系图谱一条边都没有。而且模板是按
//      笔记根目录下的精确路径去读文件的，不会像 Obsidian 那样按文件名搜索。
//
// 这个脚本在构建期把这三件事都补齐，幂等，可以反复运行。
//
// Usage: node tools/dg-notes.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const NOTES = join(root, 'src/site/notes');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** 把 frontmatter 与正文拆开。 */
function splitNote(src) {
  if (!src.startsWith('---')) return { frontmatter: '', body: src };
  const end = src.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: '', body: src };
  const close = src.indexOf('\n', end + 1);
  const fm = close === -1 ? src : src.slice(0, close + 1);
  return { frontmatter: fm, body: src.slice(fm.length) };
}

/** 只处理围栏代码块之外的正文，避免动到示例代码。 */
function mapOutsideFences(text, fn) {
  const parts = text.split(/(^```[\s\S]*?^```\s*$)/m);
  return parts.map((part, i) => (i % 2 === 1 ? part : fn(part))).join('');
}

function main() {
  const files = walk(NOTES).filter((f) => f.endsWith('.md'));

  // 路径索引（相对笔记根，去掉扩展名）与文件名索引（Obsidian 的解析方式）
  const byPath = new Set();
  const byName = new Map();
  for (const file of files) {
    const rel = relative(NOTES, file).replace(/\.md$/, '').split(/[\\/]/).join('/');
    byPath.add(rel);
    const name = basename(file).replace(/\.md$/, '');
    const seen = byName.get(name);
    if (!seen || seen.split('/').length > rel.split('/').length) byName.set(name, rel);
  }

  let addedPermalink = 0;
  let addedPublish = 0;
  let relinked = 0;
  let dead = 0;

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const { frontmatter, body } = splitNote(src);
    const rel = relative(NOTES, file).replace(/\.md$/, '').split(/[\\/]/).join('/');

    // 1. 补 permalink
    let fm = frontmatter;
    if (!/^permalink:/m.test(fm)) {
      const permalink = `permalink: /notes/${rel}/\n`;
      fm = fm ? fm.replace(/\n---\n?$/, `\n${permalink}---\n`) : `---\n${permalink}---\n`;
      addedPermalink += 1;
    }

    // 2. 标记为已发布。模板的兜底首页按 dg-publish 筛选，缺这个字段首页会显示
    //    「Nothing has been published here yet」；Digital Garden 插件发布时
    //    同样会写它，这里保持一致。本来就在笔记目录里的东西，是已发布的。
    if (!/^dg-publish:/m.test(fm)) {
      const flag = 'dg-publish: true\n';
      fm = fm ? fm.replace(/\n---\n?$/, `\n${flag}---\n`) : `---\n${flag}---\n`;
      addedPublish += 1;
    }

    // 3. 解析 wikilink
    const newBody = mapOutsideFences(body, (chunk) =>
      chunk.replace(
        /\[\[([^\]|#]+)((?:#[^\]|]*)?)(?:\|([^\]]*))?\]\]/g,
        (match, target, anchor, alias) => {
          const key = target.trim();
          const display = alias !== undefined ? alias : key.split('/').pop();
          const hit = byPath.has(key) ? key : byName.get(key.split('/').pop());
          if (hit) {
            if (hit !== key) relinked += 1;
            return `[[${hit}${anchor}|${display}]]`;
          }
          // 指向还不存在的笔记：仍然补上竖线，让它渲染成 unresolved 内部链接
          dead += 1;
          return `[[${key}${anchor}|${display}]]`;
        }
      )
    );

    const next = fm + newBody;
    if (next !== src) writeFileSync(file, next, 'utf8');
  }

  console.log(
    `笔记处理完成：${files.length} 篇，补 permalink ${addedPermalink} 个，` +
      `标记已发布 ${addedPublish} 个，重写链接 ${relinked} 条` +
      `（${dead} 条指向不存在的笔记）`
  );
}

main();
