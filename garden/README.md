# garden —— 本站的站点工程

这是 [oleeskild/digitalgarden](https://github.com/oleeskild/digitalgarden) 模板
（MIT，2026-09 仍在更新），加上为了本仓库做的改造。

**你平时不需要碰这个目录** —— 写笔记在仓库根的 `notes/`，`git push` 之后云端自动构建。
这里的东西只在你要改站点本身时才需要动。

## 它和上游模板的差别

| 改造 | 对应文件 | 为什么 |
|---|---|---|
| 第三方库全部本地化 | `src/site/vendor/`、`tools/vendor-cdn.mjs` | 模板原本从 jsdelivr / cdnjs / unpkg 加载图谱（d3 + Pixi）、搜索（flexsearch）、高亮（prism）、Mermaid、图标（lucide）、时间戳（luxon）。国内经常不通，站点会残废 |
| 笔记构建期同步 | `tools/dg-sync-notes.mjs` | 模板规定笔记住在 `src/site/notes/`，本仓库的库在根目录的 `notes/`。同步一次，避免维护两份 |
| 笔记预处理 | `tools/dg-notes.mjs` | 补 `permalink`（否则中文文件名被 slugify 吃光 → 404）、把 `[[最短路径]]` 重写成模板认识的 `[[路径\|显示名]]`（否则图谱 0 条边）、标记 `dg-publish` |
| Excalidraw 画布 | `tools/dg-excalidraw.mjs`、`tools/dg-excalidraw-build/` | 模板没有 Excalidraw 渲染器，`.excalidraw.md` 会退化成一堆文本元素。这里在构建期解压场景，页面端挂**真的** Excalidraw（只读） |
| 画布页满屏 | `src/site/styles/custom-style.scss` 末尾 | 隐藏站点顶部与右侧面板，让画布铺满左侧文件树右边的区域 |
| 关掉 gitignore 排除 | `.eleventy.js` 里的 `setUseGitIgnore(false)` | **Eleventy 默认读 `.gitignore`**。笔记被 gitignore 之后构建会「成功」但整站一篇笔记都没有 |
| 模板自带 CI 已删除 | `/.github`（原本在模板里） | 它在仓库根跑 `npm install`，而根上没有 `package.json`，必然报红。部署由 Cloudflare Pages 的 Git 集成负责 |

## 构建流水线

`npm run build` 会先跑 `prebuild`：

```
node tools/dg-sync-notes.mjs          notes/ → src/site/notes/（清空重建，保留模板两个文件）
npm-run-all excalidraw:viewer …       把 @excalidraw/excalidraw 打成自托管 IIFE
          excalidraw:fonts            复制 234 个字体子集到 src/site/fonts/
rimraf dist
node tools/dg-notes.mjs               补 permalink / 重写 wikilink / 标记 dg-publish
node tools/dg-excalidraw.mjs          解压画布场景、替换正文为挂载点、翻译画布内链接
   ↓
eleventy + sass                       产出 dist/
```

`src/site/notes/`、`src/site/fonts/`、`src/site/plugins/`、`src/site/scenes/` 都是构建产物，不进 git。

## 常用命令

```bash
npm install
npm run dev        # 开发服务器 http://localhost:8080
npm run build      # 生产构建 → dist/
npm run verify     # 端到端验证，见下
```

### `npm run verify`

用**真实浏览器**起一遍 `dist/`，检查 11 项会静默失败的东西。它抓出过两个真实事故：

1. **d3 的 jsdelivr `+esm` 产物内部用根相对路径引传递依赖**（`/npm/d3-quadtree@3.0.1/+esm`）。
   单独下载那 4 个文件看着完全正常，`grep cdn.jsdelivr` 也是零命中，但运行时图谱全是 404。
2. **Eleventy 默认吃 `.gitignore`** —— 构建日志写着成功，站点一篇笔记都没有。

所以**判断依赖问题别只靠 grep**，跑这个脚本。

需要系统装了 Chrome（用 `channel: 'chrome'`，不额外下载浏览器）。

## 更新本地化的第三方库

版本升级、或想增删 prism 语言包时：

```bash
node tools/vendor-cdn.mjs
```

它会重建整个 `src/site/vendor/`，并自检有没有漏网的外部域名引用。
要裁剪的话改脚本里的 `PRISM_LANGS`，以及 mermaid 那段（目前是全量 chunk，约 20 MB；
入口只有 30 KB，其余按需加载，**不要**换成 3.5 MB 的 UMD 单文件版，
那会让每个页面都下载 3.5 MB）。

## 上游模板的坑（踩过的）

- **必须部署在域名根上。** 模板用绝对路径（`fetch('/graph.json')`、`/styles/…`），
  `SITE_BASE_URL` 只用于 canonical URL，不用于资源路径。
  所以 GitHub Pages 的项目页（`<user>.github.io/<repo>/`）不能用 ——
  见上游 [issue #211](https://github.com/oleeskild/digitalgarden/issues/211)（2023 年提的，至今 open）。
- **不要清空 `src/site/notes/`**：模板自己的 `notes.json` 和 `notes.11tydata.js`
  就住在里面，删了会崩在 `Cannot read properties of undefined (reading 'indexOf')`。
- **`src/site/_includes/plugins/` 是构建期从 `src/plugins/` 生成的**，新克隆里不存在，
  要改插件模板改 `src/plugins/`。

---

# 上游模板文档

> 以下是 Digital Garden 模板自带的 README，原样保留 —— 那份 CSS 变量参考很有用。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="img/digital-garden-dark.svg">
    <img src="img/digital-garden.svg" alt="Digital Garden logo" width="128" height="128">
  </picture>
</p>

# Digital Obsidian Garden
This is the template to be used together with the [Digital Garden Obsidian Plugin](https://github.com/oleeskild/Obsidian-Digital-Garden).
See the README in the plugin repo for information on how to set it up.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/oleeskild/digitalgarden)

---
## Docs
Docs are available at [docs.forestry.md](https://docs.forestry.md/)

---
## Plugins

The garden is extensible through plugins: directories under `src/plugins/`
that add markup to layout slots, site-wide styles and scripts, and
build-time Eleventy/markdown-it hooks. Core features like search
(`dg-search`), link previews (`dg-link-preview`), timestamps
(`dg-timestamps`), and math (`dg-math`) are themselves plugins built on
this API — `dg-link-preview` is the smallest one to read first.

- Docs (installing plugins, writing your own): [docs.forestry.md](https://docs.forestry.md/)
- Reference code: the first-party plugins under [`src/plugins/`](src/plugins/)
- Building plugins with an AI agent: this repo ships a
  [`garden-plugin-author` skill](skills/garden-plugin-author/SKILL.md) in
  the open [Agent Skills](https://skills.sh) format, teaching agents how
  to create, test, and publish garden plugins. Install it into any
  harness (Claude Code, Cursor, Codex, …) with:

  ```sh
  npx skills add oleeskild/digitalgarden
  ```

To try a third-party plugin manually, drop its directory into
`src/plugins/` — a valid `garden-plugin.json` is all it takes. Disable any
plugin via `src/plugins/plugins.json` (`{"plugins": {"dg-search": {"enabled": false}}}`).
Only install plugins from authors you trust: plugin code runs in your site
build and in your visitors' browsers.

---
## CSS Variables

The digital garden is fully customizable through CSS variables. Override these in `src/site/styles/custom-style.scss` to customize your garden's appearance.

### How to Customize

Add your overrides to `custom-style.scss`:

```scss
body {
    --dg-content-max-width: 800px;
    --dg-content-font-size: 16px;
    --dg-sidebar-max-width: 400px;
}
```

### Responsive Layout Notes

- Content will never overlap the filetree, regardless of `--dg-content-max-width` value
- The right sidebar (TOC/graph/backlinks) automatically hides when there isn't enough viewport space
- To make the sidebar appear at smaller viewports, reduce `--dg-sidebar-max-width`

### Available Variables

#### Color Variables
You can override the base Obsidian theme color variables directly:

| Variable | Description |
|----------|-------------|
| `--text-normal` | Normal text color |
| `--text-muted` | Muted/secondary text |
| `--text-faint` | Faint text |
| `--text-accent` | Accent color |
| `--text-accent-hover` | Accent hover color |
| `--link-color` | Link color |
| `--link-color-hover` | Link color hover |
| `--link-unresolved-color` | Link color unresolved |
| `--link-unresolved-opacity` | Link color unresolved opacity |
| `--background-primary` | Primary background |
| `--background-primary-alt` | Alt primary background |
| `--background-secondary` | Secondary background |
| `--background-secondary-alt` | Alt secondary background |
| `--interactive-normal` | Interactive element color |
| `--interactive-hover` | Interactive hover color |
| `--interactive-accent` | Interactive accent |
| `--interactive-accent-hover` | Interactive accent hover |

#### Layout Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-content-max-width` | `700px` | Maximum width of content area |
| `--dg-content-margin-top` | `90px` | Top margin for content |
| `--dg-content-margin-top-mobile` | `75px` | Top margin on mobile |
| `--dg-content-font-size` | `18px` | Base font size for content |
| `--dg-content-line-height` | `1.5` | Line height for content |

#### Sidebar (Right) Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-sidebar-top` | `75px` | Sidebar top offset |
| `--dg-sidebar-gap` | `80px` | Gap between content and sidebar |
| `--dg-sidebar-min-width` | `25px` | Minimum sidebar width |
| `--dg-sidebar-max-width` | `350px` | Maximum sidebar width |
| `--dg-sidebar-container-padding` | `20px` | Sidebar container padding |
| `--dg-sidebar-container-height` | `87%` | Sidebar container height |

#### Graph Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-graph-width` | `250px` | Local graph width |
| `--dg-graph-height` | `250px` | Local graph height |
| `--dg-graph-border-radius` | `10px` | Graph border radius |
| `--dg-graph-margin-bottom` | `20px` | Graph bottom margin |
| `--dg-graph-fullscreen-width` | `90vw` | Expanded/global graph width |
| `--dg-graph-fullscreen-height` | `85vh` | Expanded/global graph height |
| `--dg-graph-node-color` | `var(--text-accent)` | Active/current node color |
| `--dg-graph-node-color-muted` | `var(--text-faint)` | Neighbor node color |
| `--dg-graph-label-color` | `var(--text-normal)` | Node label text color |
| `--dg-graph-bg` | `var(--background-primary)` | Graph background color |
| `--dg-graph-border-color` | `var(--background-secondary)` | Graph border color |

#### Filetree (Left Sidebar) Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-filetree-width` | `250px` | Filetree sidebar width |
| `--dg-filetree-min-width` | `250px` | Minimum filetree width |
| `--dg-filetree-padding` | `10px 20px` | Filetree padding |
| `--dg-filetree-gap` | `80px` | Gap from content |
| `--dg-filetree-title-size` | `32px` | Filetree title font size |

#### TOC (Table of Contents) Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-toc-padding` | `5px` | TOC container padding |
| `--dg-toc-font-size` | `0.9rem` | TOC font size |
| `--dg-toc-max-height` | `220px` | TOC max height |
| `--dg-toc-title-size` | `1.2rem` | TOC title font size |
| `--dg-toc-item-padding` | `2px 0 2px 8px` | TOC item padding |
| `--dg-toc-indent` | `1em` | TOC nested list indent |

#### Backlinks Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-backlinks-margin-top` | `10px` | Backlinks section top margin |
| `--dg-backlinks-max-height` | `250px` | Backlinks list max height |
| `--dg-backlinks-title-size` | `0.9rem` | Backlinks title font size |
| `--dg-backlinks-card-size` | `0.85rem` | Backlink card font size |
| `--dg-backlinks-card-padding` | `6px 0` | Backlink card padding |
| `--dg-backlinks-icon-size` | `14px` | Backlink icon size |

#### Search Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-search-box-width` | `900px` | Search box width |
| `--dg-search-box-max-width` | `80%` | Search box max width |
| `--dg-search-box-radius` | `15px` | Search box border radius |
| `--dg-search-box-padding` | `10px` | Search box padding |
| `--dg-search-input-size` | `2rem` | Search input font size |
| `--dg-search-input-padding` | `10px` | Search input padding |
| `--dg-search-input-radius` | `5px` | Search input border radius |
| `--dg-search-results-max-height` | `50vh` | Search results max height |
| `--dg-search-result-size` | `1.2rem` | Search result font size |
| `--dg-search-result-radius` | `10px` | Search result border radius |
| `--dg-search-link-size` | `1.4rem` | Search link font size |

#### Search Button Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-search-btn-radius` | `8px` | Search button border radius |
| `--dg-search-btn-height` | `32px` | Search button height |
| `--dg-search-btn-padding` | `0 10px` | Search button padding |
| `--dg-search-btn-gap` | `8px` | Search button icon/text gap |
| `--dg-search-btn-font-size` | `0.85rem` | Search button font size |
| `--dg-search-btn-icon-size` | `14px` | Search button icon size |

#### Navbar Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-navbar-title-size-mobile` | `18px` | Navbar title size on mobile |
| `--dg-navbar-search-margin` | `20px` | Navbar search button margin |
| `--dg-navbar-search-min-width` | `36px` | Navbar search min width |
| `--dg-logo-height` | `40px` | Site logo height on desktop |
| `--dg-logo-height-mobile` | `32px` | Site logo height on mobile |
| `--dg-logo-margin` | `10px 15px` | Site logo margin |
| `--dg-filetree-logo-height` | `70px` | Site logo height in filetree sidebar |

#### Note Link / Filetree Item Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-notelink-padding` | `4px 8px 4px 12px` | Note link padding |
| `--dg-notelink-size` | `0.85rem` | Note link font size |
| `--dg-notelink-border-width` | `2px` | Note link left border width |
| `--dg-notelink-hover-bg` | `rgba(255, 255, 255, 0.05)` | Note link hover background |
| `--dg-folder-margin` | `4px 0 4px 2px` | Folder name margin |
| `--dg-folder-icon-size` | `14px` | Folder icon size |
| `--dg-inner-folder-padding` | `3px 0 3px 0` | Inner folder padding |
| `--dg-inner-folder-margin` | `12px` | Inner folder left margin |
| `--dg-filelist-margin` | `8px` | File list left margin |

#### Graph Controls Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-graph-ctrl-padding` | `6px 10px` | Graph controls padding |
| `--dg-graph-ctrl-radius` | `6px` | Graph controls border radius |
| `--dg-graph-ctrl-margin` | `10px` | Graph controls margin |
| `--dg-graph-ctrl-size` | `0.7rem` | Graph controls font size |
| `--dg-graph-ctrl-icon-size` | `14px` | Graph control icon size |
| `--dg-graph-ctrl-gap` | `10px` | Graph controls gap |

#### Timestamps Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-timestamps-size` | `0.8em` | Timestamps font size |
| `--dg-timestamps-gap` | `10px` | Timestamps gap |
| `--dg-timestamps-margin-top` | `20px` | Timestamps top margin |

#### Misc Component Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-overlay-bg` | `rgba(0, 0, 0, 0.5)` | Overlay background color |
| `--dg-mermaid-radius` | `25px` | Mermaid diagram border radius |
| `--dg-mermaid-padding` | `10px` | Mermaid diagram padding |
| `--dg-transclusion-padding` | `8px` | Transclusion container padding |
| `--dg-external-link-icon-size` | `13px` | External link icon size |
| `--dg-external-link-padding` | `16px` | External link right padding |
