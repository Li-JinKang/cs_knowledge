// Build-time glob of every markdown file in the repository's top-level `docs/`
// folder.
//
// Why `docs/` and not `.agents/`: the site is a public artifact, while the
// `.agents/` directory holds the author's private agent skills. Keeping the two
// separate means adding a skill can never accidentally publish it. To publish a
// new page, drop a .md into `docs/` and rebuild.
//
// Vite turns this into a static map of path -> lazy loader, so there is no index
// file to maintain.
const modules = import.meta.glob('../../docs/**/*.md', { query: '?raw', import: 'default' });

export const docsMap = Object.fromEntries(
  Object.entries(modules).map(([path, load]) => [
    // '../../docs/guide/setup.md' -> 'guide/setup.md'
    path.replace(/^(\.\.\/)+docs\//, ''),
    load,
  ])
);

// Short blurbs for the index page. Optional -- unknown files just show no blurb
// rather than being hidden, so a new doc is never silently dropped.
const BLURBS = {
  'getting-started.md': '这个仓库是什么，怎么用，怎么改。',
};

export function listDocs() {
  return Object.keys(docsMap)
    .sort((a, b) => {
      // Root-level pages first, then alphabetical within each folder.
      const aDepth = a.includes('/') ? 1 : 0;
      const bDepth = b.includes('/') ? 1 : 0;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.localeCompare(b);
    })
    .map((path) => ({
      path,
      title: path.split('/').pop().replace(/\.md$/i, ''),
      group: path.includes('/') ? path.split('/')[0] : '指南',
      blurb: BLURBS[path] ?? '',
    }));
}
