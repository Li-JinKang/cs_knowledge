# cs_knowledge

Android 知识体系的 Obsidian 库，以及由它生成的公开笔记本站点。

```
你在 Obsidian 里写 → git push → 站点自动重建上线
```

## 在线看

**<https://cs-knowledge-r1t.pages.dev/>**

- **笔记**：左侧文件树，右侧正文，支持反向链接、大纲、全文搜索
- **关系图谱**：每个页面右上角有局部图谱，可以切到全局
- **思维导图**：`Android/思维导图.excalidraw` 这一页是**真的 Excalidraw 画布**，
  可以缩放、拖拽，和 Obsidian 里看到的一致（只读，改图请在 Obsidian 里改）

## 用 Obsidian 打开

```bash
git clone https://github.com/MimicHunterZ/cs_knowledge.git
```

用 Obsidian 的「打开文件夹作为库」选中仓库里的 **`notes/`** 子目录，不要选仓库根。
仓库里已经包含：

- `notes/.obsidian/community-plugins.json` —— 只启用 Excalidraw
- `notes/.obsidian/plugins/obsidian-excalidraw-plugin/` —— 插件本体
- `notes/.obsidian/plugins/obsidian-excalidraw-plugin/data.json` —— 已把 Mindmap Builder 挂到侧边栏
- `notes/Excalidraw/Scripts/Downloaded/Mindmap Builder.md` —— Mindmap Builder 脚本

打开 `notes/Android/思维导图.excalidraw.md`，在「更多选项」里切到 Excalidraw 视图即可编辑。

> Mindmap Builder 不是独立插件，它是 Excalidraw 插件的一个脚本。
> 想升级插件：Obsidian 设置 → 第三方插件 → 检查更新。

## 目录

```
├─ README.md                         本文件（GitHub 只渲染仓库根的 README，它不在库里）
├─ notes/                            Obsidian 库 —— 用 Obsidian 打开这一层
│  ├─ .obsidian/                     最小化库配置（Excalidraw 插件随仓库分发）
│  ├─ docs/                          会发布成站点的笔记
│  ├─ Android/思维导图.excalidraw.md  思维导图（源文件）
│  └─ Excalidraw/Scripts/Downloaded/ Mindmap Builder 脚本（不发布，属于工具）
└─ garden/                           站点工程（Digital Garden 模板 + 本地化改造）
   ├─ src/site/notes/                构建期从 ../../notes 同步，不进 git
   ├─ src/site/vendor/               本地化的第三方库，零 CDN 依赖
   ├─ tools/                         构建脚本，见下
   └─ .eleventy.js  package.json
```

> **为什么库在 `notes/` 而不是仓库根？** `garden/node_modules` 有上万个文件，
> 而 Obsidian 会索引并监听库根目录下的每一个文件（`node_modules` 不在它的忽略名单里）。
> 库若放在仓库根，图谱里会挤进几百个依赖自带的 README，启动时还要遍历这些文件。
> 把库收进 `notes/`，站点工程就整体位于库之外，Obsidian 根本看不到它。

## 写一篇笔记 / 改思维导图，然后上线

**你只需要 `git push`。** 其余全在构建期自动完成：

```
git add -A && git commit -m "..." && git push
   ↓ Cloudflare Pages 自动构建（约 1~2 分钟）
同步 notes/ → garden/src/site/notes/
补 permalink（否则中文文件名会被 slugify 吃光，页面 404）
把 [[最短路径]] 重写成模板认识的 [[路径|显示名]]（否则关系图谱 0 条边）
标记 dg-publish（否则首页不列这篇）
解压画布场景、把画布页换成挂载点、翻译画布里的 [[链接]]
打包 Excalidraw 渲染岛、复制字体
   ↓
上线
```

新增一篇笔记就是把 `.md` 丢进 `notes/` 的任意位置（`Excalidraw/` 除外，那是工具目录）。
不需要维护任何索引文件。

## 站点工程说明

`garden/` 是 [oleeskild/digitalgarden](https://github.com/oleeskild/digitalgarden) 模板
（MIT，482 stars），加上为了这个仓库做的几处改造：

| 改造 | 为什么 |
|---|---|
| `src/site/vendor/` 本地化全部第三方库 | 模板原本依赖 jsdelivr / cdnjs / unpkg 加载图谱（d3 + Pixi）、搜索（flexsearch）、高亮（prism）、Mermaid、图标（lucide）。国内经常不通，站点会残废。`tools/vendor-cdn.mjs` 可重建 |
| `tools/dg-sync-notes.mjs` | 模板规定笔记住在 `src/site/notes/`，我们的库在 `notes/`。构建期同步，避免维护两份 |
| `tools/dg-notes.mjs` | 补 `permalink`、重写 wikilink、标记 `dg-publish` |
| `tools/dg-excalidraw.mjs` | 把 `.excalidraw.md` 变成真画布页 |
| `tools/dg-excalidraw-build/` | 把 `@excalidraw/excalidraw` 打成自托管 IIFE（7.6 MB，只在画布页加载） |

### 几个会静默失败的坑（都已处理）

1. **Eleventy 默认读 `.gitignore`。** 我们把同步进来的笔记 gitignore 掉了，
   结果构建「成功」但整站一篇笔记都没有。`.eleventy.js` 里加了 `setUseGitIgnore(false)`。
2. **模板的 `wikiLinkRegex` 只认带竖线的链接**（`/\[\[(.*?\|.*?)\]\]/g`）。
   Obsidian 默认的 `[[最短路径]]` 写出来图谱一条边都没有。
3. **模板用绝对路径**（`fetch('/graph.json')`、`/styles/…`），
   所以站点必须部署在**域名根**上 —— 这正是不用 GitHub Pages 项目页的原因。
4. **d3 的 jsdelivr `+esm` 产物内部用根相对路径引传递依赖**，单独下载那 4 个文件
   看着正常、运行全是 404。`tools/vendor-cdn.mjs` 会递归抓并改写成相对路径。

## 本地开发

```bash
cd garden
npm install
npm run dev      # 开发服务器 http://localhost:8080
npm run build    # 产物输出到 garden/dist
```

## 部署

Cloudflare Pages，Git 集成，构建配置：

```
Root directory:      garden
Build command:       npm run build
Build output:        dist
环境变量 NODE_VERSION: 22
```

推送到 `main` 即自动构建上线；PR 会自动生成预览部署。

> **不要用 GitHub Pages 的项目页**（`<用户名>.github.io/cs_knowledge/`）：
> 模板的资源路径是绝对路径，放子路径会全部 404。
> 详见模板的 [issue #211](https://github.com/oleeskild/digitalgarden/issues/211)（2023 年提的，至今 open）。

## 注意

- 仓库有意**不包含** `notes/.obsidian/workspace.json`、`hotkeys.json` 等个人运行状态
- 若你安装了带 API key 的插件（如 Copilot），**不要提交它的 `data.json`**；
  往 `.gitignore` 里加一条
- `notes/` 里的东西默认**全部公开**（同步脚本只排除点开头的目录和 `Excalidraw/`）。
  要放私密内容，请另建一个库
