// Build-time glob of every markdown file under src/docs.
//
// Vite turns this into a static map of path -> lazy loader, so dropping a new
// .md file into src/docs and rebuilding is all it takes to publish it. No index
// file to maintain.
const modules = import.meta.glob('./docs/**/*.md', { query: '?raw', import: 'default' });

export const docsMap = Object.fromEntries(
  Object.entries(modules).map(([path, load]) => [
    // './docs/references/mindmap-api.md' -> 'references/mindmap-api.md'
    path.replace(/^\.\/docs\//, ''),
    load,
  ])
);

// A frontmatter-free title heuristic: first `# heading`, else the filename.
function titleOf(path) {
  const base = path.split('/').pop().replace(/\.md$/i, '');
  return base;
}

export function docEntry(path) {
  const isSkillRoot = path === 'SKILL.md';
  const dir = path.includes('/') ? path.split('/')[0] : '';
  return {
    path,
    title: titleOf(path),
    group: isSkillRoot ? '总览' : dir === 'references' ? '参考' : '文档',
    // A short blurb shown on the index page. Kept here rather than parsed out of
    // the markdown so the index stays readable regardless of doc structure.
    blurb: BLURBS[path] ?? '',
  };
}

const BLURBS = {
  'SKILL.md': '如何在 Obsidian 里用 MindMap Builder API 程序化生成思维导图。',
  'references/execution-model.md': 'obsidian eval 的执行模型：IIFE、异步轮询、引号与负载编码。',
  'references/file-targeting.md': '按路径锁定目标视图，避免误写到其它文件。',
  'references/windows-gotchas.md': 'Windows/PowerShell 5.1 的传输层陷阱与症状对照。',
  'references/mindmap-api.md': 'MindMapBuilderAPI 方法表、动作常量与版本差异。',
};

export function listDocs(rawContent) {
  return Object.keys(docsMap)
    .sort((a, b) => {
      if (a === 'SKILL.md') return -1;
      if (b === 'SKILL.md') return 1;
      return a.localeCompare(b);
    })
    .map(docEntry);
}
