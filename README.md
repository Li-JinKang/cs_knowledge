# cs_knowledge

一张 Android 知识体系思维导图，以 Obsidian 库 + 可交互网页两种形式提供。

- **在线站点**：思维导图可在浏览器里缩放、拖拽、编辑，并导出 PNG / SVG / `.excalidraw`
- **克隆即用**：仓库自带 Excalidraw 插件与 Mindmap Builder，clone 后用 Obsidian 打开就能直接改图

内容刻意保持精简 —— 目前只有思维导图本身，没有附带讲义笔记。

## 在线看

站点首页是一张可交互的思维导图：

| 操作 | 说明 |
|---|---|
| 滚轮 / 触控板 | 缩放 |
| 按住空格拖动，或直接拖动空白处 | 平移画布 |
| 「浏览模式 / 编辑中」按钮 | 解锁后可拖动节点、改文字、加图形 |
| PNG / SVG / .excalidraw | 导出当前画面 |

> **网页上的编辑只保存在你自己的浏览器（localStorage），不会写回仓库。**
> 站点是纯静态托管，没有后端。想永久保存改动，请用「.excalidraw」导出，
> 或在本地 Obsidian 库里修改后提交。

顶栏「文档」里是 `src/docs/` 下的 markdown，构建时自动收集成页面。

## 用 Obsidian 打开

```bash
git clone https://github.com/<你的用户名>/cs_knowledge.git
```

然后用 Obsidian 的「打开文件夹作为库」选中该目录。仓库里已经包含：

- `.obsidian/community-plugins.json` —— 只启用 Excalidraw
- `.obsidian/plugins/obsidian-excalidraw-plugin/` —— 插件本体（main.js / manifest.json / styles.css）
- `.obsidian/plugins/obsidian-excalidraw-plugin/data.json` —— 已把 Mindmap Builder 挂到侧边栏
- `Excalidraw/Scripts/Downloaded/Mindmap Builder.md` —— Mindmap Builder 脚本

打开 `Android/思维导图.excalidraw.md`，在「更多选项」里切到 Excalidraw 视图即可编辑。
> Mindmap Builder 不是独立插件，它是 Excalidraw 插件的一个脚本。
> 想升级插件：Obsidian 设置 → 第三方插件 → 检查更新。

## 本地开发站点

```bash
cd site
npm install
npm run dev      # 开发服务器
npm run build    # 产物输出到 site/dist
npm run preview  # 预览构建结果
```

### 目录

```
site/
├─ src/
│  ├─ scene.json        思维导图的场景数据（从 .excalidraw.md 解压而来）
│  ├─ MindMap.jsx       Excalidraw 交互页
│  ├─ DocsIndex.jsx     文档列表
│  ├─ Doc.jsx           markdown 渲染
│  ├─ docsMap.js        构建时收集 src/docs 下的所有 .md
│  └─ docs/             文档内容（来自 skill 目录）
├─ tools/
│  ├─ extract-scene.mjs 解压 .excalidraw.md → scene.json
│  └─ verify.mjs        端到端验证（Playwright）
└─ index.html
```

### 新增一篇文档

把 `.md` 放进 `site/src/docs/`，重新 `npm run build`，它会自动出现在文档页。
`docsMap.js` 里的 `BLURBS` 可以给它加一句简介。

### 修改思维导图后同步到站点

在 Obsidian 里改完图，重新解压场景：

```bash
cd site
node tools/extract-scene.mjs ../Android/思维导图.excalidraw.md src/scene.json
npm run build
```

`.excalidraw.md` 里的图形数据是 **lz-string（base64 变体）** 压缩的，
不是标准 zlib/gzip —— 所以用 `lz-string` 解，`extract-scene.mjs` 已经处理好了。

### 验证

```bash
cd site
npm run build
npx http-server dist -p 8080     # 或任意静态服务器
node tools/verify.mjs http://127.0.0.1:8080/
```

验证脚本会检查：画布挂载、**148 个文本节点全部有真实字体宽度**（中文字形缺失会表现为零宽）、
PNG 导出可用、文档路由可渲染、无控制台报错。

## 部署

推送到 `main` 分支即自动触发 `.github/workflows/pages.yml`，
构建 `site/` 并发布到 GitHub Pages。

仓库设置里把 **Settings → Pages → Source** 设为 **GitHub Actions**。

站点用相对路径引用资源、用 hash 路由，所以放在
`https://<用户名>.github.io/cs_knowledge/` 这样的子路径下也不需要改配置。

## 注意

- 仓库有意**不包含** `.obsidian/workspace.json`、`hotkeys.json` 等个人运行状态
- 若你安装了带 API key 的插件（如 Copilot），**不要提交它的 `data.json`**；
  往 `.gitignore` 里加一条
