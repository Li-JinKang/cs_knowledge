# 快速上手

这个仓库是一套 **Android 知识体系笔记**（思维导图 + 讲义），同时发布成一个公开的笔记站。

```
你在 Obsidian 里写 → git push → 站点自动重建上线
```

## 在线看

站点上线后填在这里。它长这样：

| 区域 | 内容 |
|---|---|
| 左侧 | 文件树 + 搜索（⌘K） |
| 中间 | 笔记正文；每页右上角有**局部关系图谱**，可切到全局 |
| 右侧 | 本文大纲 + **反向链接**（哪些笔记提到了这篇） |

**思维导图**在 `Android/思维导图` 这一页，它是**真的 Excalidraw 画布** ——
可以缩放、拖拽、用左下角的加减号，和 Obsidian 里看到的一致。

> 网页上的画布是**只读**的（`viewModeEnabled`）。要改图，请在本地 Obsidian 库里改，
> 然后提交。站点是纯静态托管，没有服务端，不存在「网页上编辑保存」这回事。

## 用 Obsidian 打开

```bash
git clone https://github.com/MimicHunterZ/cs_knowledge.git
```

用 Obsidian 的「打开文件夹作为库」选中仓库里的 **`notes/`** 子目录（不是仓库根）。仓库里已经带好了：

| 内容 | 作用 |
|---|---|
| `notes/.obsidian/plugins/obsidian-excalidraw-plugin/` | Excalidraw 插件本体 |
| `notes/.obsidian/plugins/obsidian-excalidraw-plugin/data.json` | 已把 Mindmap Builder 挂到侧边栏 |
| `notes/Excalidraw/Scripts/Downloaded/Mindmap Builder.md` | Mindmap Builder 脚本 |
| `notes/Android/思维导图.excalidraw.md` | 思维导图本身 |

打开 `notes/Android/思维导图.excalidraw.md`，在「更多选项」里切到 Excalidraw 视图就能编辑。

> **Mindmap Builder 不是独立插件**，它是 Excalidraw 插件的一个脚本。
> 想升级插件：Obsidian 设置 → 第三方插件 → 检查更新。

## 写完笔记怎么上线

**只需要 `git push`。** 其余在构建期自动完成：

```
git add -A && git commit -m "..." && git push
   ↓ 约 1~2 分钟
同步 notes/ → 站点工程
补 permalink          否则中文文件名会被 slugify 吃光，页面 404
重写 [[最短路径]]     否则关系图谱一条边都没有
标记 dg-publish       否则首页不列这篇
解压画布场景、翻译画布里的 [[链接]]、把画布页换成挂载点
打包 Excalidraw 渲染岛、复制字体
   ↓
上线
```

**加一篇笔记**就是把 `.md` 放进 `notes/` 的任意位置，不需要维护任何索引文件。

> `.excalidraw.md` 里的图形数据是 **lz-string（base64 变体）** 压缩的，不是标准 zlib/gzip，
> 所以不能直接手改 —— 但那也不需要你管，构建期会自动解压。

> `notes/Excalidraw/` 里的东西**不会**发布（那是插件的脚本目录，属于工具）。其余
> `notes/` 下的内容默认全部公开。

## 本地开发站点

```bash
cd garden
npm install
npm run dev        # 开发服务器 http://localhost:8080
npm run build      # 产物到 garden/dist
```

`garden/` 是 [Digital Garden](https://github.com/oleeskild/digitalgarden) 模板 +
这个仓库的改造（第三方库全部本地化、笔记构建期同步、Excalidraw 画布集成）。
详见仓库根 `README.md` 里的「站点工程说明」。

## 目录结构

```
├─ README.md                         仓库说明（不在 Obsidian 库里）
├─ notes/                            Obsidian 库 —— 用 Obsidian 打开这一层
│  ├─ .obsidian/                     最小化库配置（Excalidraw 插件随仓库分发）
│  ├─ Android/思维导图.excalidraw.md  思维导图（源）
│  ├─ Excalidraw/Scripts/Downloaded/ Mindmap Builder 脚本（不发布）
│  └─ docs/                          会发布成站点的笔记
└─ garden/                           站点工程（在 Obsidian 库之外，不会被索引）
   ├─ src/site/notes/                构建期从 ../../notes 同步，不进 git
   ├─ src/site/vendor/               本地化的第三方库（图谱/搜索/高亮/Mermaid…）
   ├─ tools/                         同步、解压画布、重建 vendor 等脚本
   └─ .eleventy.js  package.json
```

> **为什么笔记在 `notes/` 而不是仓库根？** `garden/node_modules` 有上万个文件，
> 而 Obsidian 会索引并监听库根目录下的每一个文件（`node_modules` 不在它的忽略名单里）。
> 库若放在仓库根，图谱里就会挤进几百个依赖自带的 README，启动时还要遍历这些文件。
> 把库收进 `notes/`，站点工程就整体位于库之外，Obsidian 根本看不到它。

## 注意事项

- 仓库**不含** `notes/.obsidian/workspace.json`、`hotkeys.json` 等个人运行状态
- 安装了带 API key 的插件时，**不要提交它的 `data.json`**
- `notes/` 里的内容默认全部公开。要放私密内容，请另建一个库
