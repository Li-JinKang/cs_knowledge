---
name: obsidian-cli-automation
description: Build and edit Excalidraw drawings and MindMap Builder mind maps inside a running Obsidian vault, by driving the plugin APIs from the terminal via `obsidian eval`. Use this whenever the user wants to generate a mind map, knowledge graph, or mindmap programmatically; turn notes or an outline into an Excalidraw diagram; create or modify .excalidraw.md files; script ExcalidrawAutomate; or automate Obsidian from the shell. Also load it for vault-wide batch work (bulk note creation, property/tag edits, running plugin commands) even if the user never says "CLI" — writing .excalidraw.md by hand is almost always wrong, because the drawing lives in compressed scene data rather than readable text.
---

# Building mind maps and drawings in Obsidian

Obsidian ships a CLI whose `eval` command executes JavaScript inside the Electron
renderer. That gives direct access to the app object, every plugin, and anything
they expose on `window` — including `ExcalidrawAutomate` and `MindMapBuilderAPI`.

This skill is about **using those APIs to produce a map**. The mechanics of
getting JavaScript in and out on Windows (quoting, code pages, length limits) are
real but secondary; they live in `references/`.

## Before you write anything

You are editing documents the user cares about. Two things protect them.

**Target by exact path, never "the active view."** Resolving the target
implicitly is how you overwrite the wrong document — it happened during this
skill's development and destroyed a file. Resolve the Excalidraw leaf whose
`view.file.path` matches your intended target, pass that view to `setView`, and
verify the resolved path before mutating. Skip this and nothing else here is
safe: `references/file-targeting.md`.

**Back up first.** `Copy-Item <file> <file>.bak` before the first write. It costs
nothing and means a mistake is recoverable without heroics.

Also confirm the vault is actually open — the CLI talks to a live instance, it
does not start one.

## The workflow

MindMap Builder lays out the map for you. You do not compute geometry, draw
boxes, or place arrows: you declare a hierarchy and the plugin does everything
else. Work in this order.

### 1. Make sure the target drawing exists and is open

A drawing is a `.excalidraw.md` file. If the user named a file, open it. If it
already has nodes, decide with them whether to extend it or start clean —
clearing a canvas is destructive.

To start empty:

```js
ea.viewUpdateScene({ elements: [], appState: {} }, false);
```

### 2. Wake the plugin and confirm the API is live

`MindMapBuilderAPI` only exists once MindMap Builder has been activated for a
view. Check, and if it is missing, run the plugin's command to activate it:

```js
JSON.stringify({
  api: typeof window.MindMapBuilderAPI,
  ready: window.MindMapBuilderAPI ? window.MindMapBuilderAPI.ready() : null,
  roots: window.MindMapBuilderAPI ? window.MindMapBuilderAPI.getMindMapRoots() : null
})
```

If `api` is `undefined`, find and invoke the command:

```js
(function () {
  var cmd = Object.keys(app.commands.commands).find(function (k) {
    return /.*Mindmap Builder$/.test(k);
  });
  if (!cmd) { return JSON.stringify({ err: 'mindmap-builder-not-installed' }); }
  app.commands.commands[cmd].callback();   // run it against the active leaf
  return JSON.stringify({ invoked: cmd });
})()
```

### 3. Write the outline

This is the part worth getting right. `importMarkdown` takes a markdown bullet
hierarchy — **two spaces per level**:

```
- 四大组件
  - Activity
    - 生命周期
    - 启动模式
  - Service
    - 启动方式
- 应用框架
  - Handler
    - 四要素
    - 消息机制
```

Guidance that produces maps people can actually read:

- Aim for a **breadth-first skeleton** first — a handful of top-level branches,
  each with a few children. Depth is easy to add later; a map that is deep on one
  branch and empty on the others is hard to fix visually.
- Keep labels short (2–6 characters in Chinese, 1–3 words in English). Long
  labels force wide boxes and the layout degrades.
- Make siblings parallel in form. If one child is a noun and the next is a verb
  phrase, the hierarchy is probably wrong.
- Save the outline to a file and review it before importing. It is much easier
  to edit text than to edit a half-built canvas.

### 4. Create the root, then import branch by branch

If the canvas has no map (`getMindMapRoots().data.rootIds` is empty), create a
root first, then graft each top-level branch under it:

```js
var mmb = window.MindMapBuilderAPI;

// root
await mmb.addNode({ text: 'Android 知识体系' });

// then, once per top-level branch:
var roots = mmb.getMindMapRoots();
await mmb.importMarkdown({
  markdown: '- 四大组件\n  - Activity\n    - 生命周期',
  parentId: roots.data.rootIds[0]
});

await mmb.refreshMapLayout(roots.data.rootIds[0]);
```

**One top-level branch per call, then verify.** A single giant import is harder
to debug and overruns the command-line length ceiling. Sequential, verifiable
steps are faster in practice because failures are local.

`importMarkdown` returns `addedNodeIds`, which includes intermediate nodes — its
count is *not* the node count. Do not assert on it; read the scene back instead.

### 5. Verify what actually landed

Never assume the import worked. Read the scene:

```js
JSON.stringify({
  els: window.ExcalidrawAutomate.getViewElements().length,
  types: (function () {
    var c = {};
    window.ExcalidrawAutomate.getViewElements().forEach(function (el) {
      c[el.type] = (c[el.type] || 0) + 1;
    });
    return c;
  })(),
  texts: window.ExcalidrawAutomate.getViewElements()
    .filter(function (el) { return el.type === 'text'; })
    .map(function (el) { return el.text; })
});
```

Then check for the three failure modes this catches:

- **Node count is right but arrows are short** (`arrows < nodes - 1`) — some
  branches attached to their own root instead of yours.
- **A label starts with `\u`** — escape sequences were never interpreted. The
  payload must be `eval`'d in the renderer, not passed raw. See
  `references/execution-model.md`.
- **Nodes are duplicated** — a retry ran twice. Re-verify before retrying.

`exportMarkdown()` gives a second, independent view of the hierarchy and is a
good cross-check that parents and children are what you intended.

## Reading and extending an existing map

```js
mmb.getMindMapRoots()                 // { rootIds }  -- empty means no map yet
mmb.getMapInfo(nodeId)                // { nodeId, rootId, settingsRootId, depth }
mmb.getNodeText(nodeId)               // { nodeId, text, ontology }
mmb.exportMarkdown({ nodeId })        // branch as markdown
mmb.addNode({ text, parentId })       // -> { nodeId, arrowId, rootId }
mmb.performAction(mmb.Actions.FOLD_ALL)
```

Every method except `ready()` returns
`{ ok: true, data }` or `{ ok: false, error: { code, message } }` — check `.ok`
before touching `.data`.

Validate a payload before sending it; it is cheaper than debugging a partial
import:

```js
mmb.validate('importMarkdown', { markdown: md, parentId: id })
```

Not every documented method exists in every build — `listMethods()` is the
authority. Details, action constants, and error codes:
`references/mindmap-api.md`.

## Making the map look good

The plugin's defaults are reasonable. When the user wants something specific:

- **Layout direction** — `setMapConfig({ patch: { growthMode: 'Right-Left' }, relayout: true })`.
  Valid modes include `Radial`, `Right-facing`, `Left-facing`, `Right-Left`,
  `Up-facing`, `Down-facing`, `Up-Down`.
- **Per-branch styling** — `getElementIdsByRole(rootId)` returns
  `{ nodes, branchArrows, crossLinks, boundaries, decorations, boundTexts }`.
  Feed those ids to ExcalidrawAutomate to colour or group a branch.
- **Boundaries and folding** — `selectNode(id)` then
  `performAction(mmb.Actions.TOGGLE_BOUNDARY)` / `FOLD_ALL`.

Ask before restyling a map the user built by hand; their layout may be
deliberate.

## Execution mechanics (read when you hit friction)

`references/execution-model.md` — why `eval` needs an IIFE, why it cannot await
(async work goes to a global, then you poll), why double quotes vanish, and the
payload-encoding pattern that survives it all.

`references/windows-gotchas.md` — PowerShell 5.1 encoding traps, batch-file
transport, the length ceiling, and the symptoms each one produces.

`references/file-targeting.md` — the path-locking pattern. Read this before your
first write.

`scripts/obsidian-eval.ps1` — working transport helper.
`Invoke-ObsidianEval`, `Wait-ObsidianState`, `Get-Base64Payload`, and
`New-TargetedCode` (the path-locking wrapper). Dot-source it rather than
rebuilding the plumbing.

## Finish cleanly

Confirm the drawing persisted — Excalidraw autosaves on an interval, so check
file size and mtime rather than looking for a save call. Remove any scaffolding
you generated (templates, `.bat` shims, probe scripts); the helper keeps its
shim in the temp directory for exactly this reason. Leave the `.bak` in place if
the user might still want it.
