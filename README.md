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

顶栏「文档」里的页面，构建时从仓库根目录的 `docs/` 自动收集。

## 用 Obsidian 打开

```bash
git clone https://github.com/MimicHunterZ/cs_knowledge.git
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
├─ docs/                             站点文档页的内容来源（放 .md 即自动发布）
├─ Android/思维导图.excalidraw.md     思维导图（源）
├─ Excalidraw/Scripts/Downloaded/     Mindmap Builder 脚本
├─ site/
│  ├─ src/
│  │  ├─ scene.json     思维导图的场景数据（从 .excalidraw.md 解压而来）
│  │  ├─ MindMap.jsx    Excalidraw 交互页
│  │  ├─ DocsIndex.jsx  文档列表
│  │  ├─ Doc.jsx        markdown 渲染
│  │  └─ docsMap.js     构建时收集根目录 docs/
│  ├─ tools/
│  │  ├─ extract-scene.mjs  解压 .excalidraw.md → scene.json
│  │  ├─ copy-fonts.mjs     把 Excalidraw 字体复制到 public/（构建时自动执行）
│  │  ├─ verify.mjs         端到端验证（Playwright）
│  │  └─ preflight.ps1      提交前密钥/隐私审计
│  └─ index.html
└─ .github/workflows/pages.yml
```

### 新增一篇文档

把 `.md` 放进仓库根目录的 `docs/`，重新 `npm run build`，它会自动出现在文档页。
不需要维护索引文件 —— 构建时用 `import.meta.glob` 收集（见 `site/src/docsMap.js`）。

> 文档**只**从 `docs/` 读取。`.agents/` 是作者私有的 agent 技能目录，
> 已被 `.gitignore` 排除，也不会被 glob 到，因此新增技能不会误发布到站点。
> `verify.mjs` 里有专门的探测来守住这条边界。

### 修改思维导图后同步到站点

在 Obsidian 里改完图，重新解压场景：

```bash
cd site
node tools/extract-scene.mjs ../Android/思维导图.excalidraw.md src/scene.json
npm run build
```

`.excalidraw.md` 里的图形数据是 **lz-string（base64 变体）** 压缩的，
不是标准 zlib/gzip —— 所以用 `lz-string` 解，`extract-scene.mjs` 已经处理好了。

### 字体

Excalidraw 默认从 `esm.sh` 拉字体，这是个本站无法控制的外部 CDN；
一旦它不可达，中文字形会**静默**回退到系统字体。所以 `copy-fonts.mjs` 会把
包里的字体子集复制到 `public/fonts/`，并在入口设置
`window.EXCALIDRAW_ASSET_PATH` 指向本站。字体不进 git（12.5 MB，由构建生成）。

### 验证

```bash
cd site
npm run build
npx http-server dist -p 8080     # 或任意静态服务器
node tools/verify.mjs http://127.0.0.1:8080/
```

12 项检查覆盖的都是**会静默出问题**的点：

- 画布挂载、场景元素数量
- **148 个文本节点是否都有真实字体宽度** —— 中文字形缺失表现为零宽，控制台不报错
- 字体是否全部来自本站、有无意外第三方请求
- PNG 导出是否真能产出文件
- 文档路由是否渲染
- **`.agents` 技能与笔记是否意外可访问**、文档索引是否泄露 skill 页面
- 无失败请求、无控制台报错

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
