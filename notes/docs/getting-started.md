# 快速上手

这个仓库只有一张图：**Android 知识体系思维导图**（169 个节点、10 大分支）。
它以两种形式存在 —— 一个 Obsidian 库，和一个可交互的网页。

## 在线看

打开 <https://mimichunterz.github.io/cs_knowledge/>，首页就是这张图。

| 操作 | 效果 |
|---|---|
| 滚轮 / 触控板双指 | 缩放 |
| 拖动空白处 | 平移画布 |
| 点「浏览模式」 | 解锁编辑，可拖动节点、改文字、加图形 |
| PNG / SVG / `.excalidraw` | 导出当前画面 |

> 网页上的编辑只存在你自己的浏览器里（localStorage），**不会写回仓库**。
> 站点是纯静态托管，没有服务端。想永久保存，请用「.excalidraw」导出，
> 或在本地 Obsidian 库里改完再提交。

## 用 Obsidian 打开

```bash
git clone https://github.com/MimicHunterZ/cs_knowledge.git
```

用 Obsidian 的「打开文件夹作为库」选中仓库里的 `notes/` 子目录即可。仓库里已经带好了：

| 内容 | 作用 |
|---|---|
| `notes/.obsidian/plugins/obsidian-excalidraw-plugin/` | Excalidraw 插件本体 |
| `notes/.obsidian/plugins/obsidian-excalidraw-plugin/data.json` | 已把 Mindmap Builder 挂到侧边栏 |
| `notes/Excalidraw/Scripts/Downloaded/Mindmap Builder.md` | Mindmap Builder 脚本 |
| `notes/Android/思维导图.excalidraw.md` | 思维导图本身 |

打开 `notes/Android/思维导图.excalidraw.md`，在「更多选项」里切到 Excalidraw 视图就能编辑。

> **Mindmap Builder 不是独立插件**，它是 Excalidraw 插件的一个脚本。
> 想升级插件：Obsidian 设置 → 第三方插件 → 检查更新。

## 改图之后同步到网页

`.excalidraw.md` 里的图形数据是 **lz-string（base64 变体）** 压缩的，
不是标准 zlib/gzip，所以不能直接手改。用仓库自带的脚本解压：

```bash
cd site
node tools/extract-scene.mjs ../notes/Android/思维导图.excalidraw.md src/scene.json
npm run build
```

提交推送后，GitHub Actions 会自动重新部署。

## 加一篇文档

把 `.md` 放进 vault 的 `notes/docs/`，重新构建，它会自动出现在「文档」页。
不需要维护索引文件 —— 构建时用 `import.meta.glob` 收集（见 `site/src/docsMap.js`）。

## 本地开发

```bash
cd site
npm install
npm run dev        # 开发服务器
npm run build      # 产物到 site/dist
npm run verify     # 端到端检查（需先起静态服务器）
```

### 验证脚本查什么

`npm run verify` 用真实浏览器跑完整流程，检查的都是会静默出问题的点：

- 画布是否挂载、场景元素数量是否正确
- **169 个文本节点是否都有真实字体宽度** —— 中文字形缺失会表现为零宽，控制台不报错
- PNG 导出是否真能产出文件
- 文档路由是否渲染
- 是否有控制台报错

## 目录结构

```
├─ README.md                        仓库说明（不在 Obsidian 库里）
├─ notes/                           Obsidian 库 —— 用 Obsidian 打开这一层
│  ├─ .obsidian/                    最小化库配置（Excalidraw 插件随仓库分发）
│  ├─ Android/思维导图.excalidraw.md 思维导图（源）
│  ├─ Excalidraw/Scripts/Downloaded/ Mindmap Builder 脚本
│  └─ docs/                          站点文档页的内容来源
├─ site/                            站点工程（在 Obsidian 库之外，不会被索引）
│  ├─ src/scene.json                从 .excalidraw.md 解压出的场景数据
│  ├─ src/MindMap.jsx               Excalidraw 交互页
│  ├─ src/docsMap.js                构建时收集 notes/docs/
│  └─ tools/                        解压、验证、审计脚本
└─ .github/workflows/pages.yml      自动部署
```

> **为什么笔记在 `notes/` 而不是仓库根？** `site/node_modules` 有约 1.75 万个文件，
> 而 Obsidian 会索引并监听库根目录下的每一个文件（`node_modules` 不在它的忽略名单里）。
> 库若放在仓库根，图谱里就会挤进 509 个依赖自带的 README，启动时还要遍历这 1.75 万个文件。
> 把库收进 `notes/`，站点工程就整体位于库之外，Obsidian 根本看不到它。

## 注意事项

- 仓库**不含** `notes/.obsidian/workspace.json`、`hotkeys.json` 等个人运行状态
- 安装了带 API key 的插件时，**不要提交它的 `data.json`**
- `.agents/` 是私有的 agent 技能目录，**已被 `.gitignore` 排除**，不会出现在站点上
