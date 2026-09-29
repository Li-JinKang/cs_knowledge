# MindMap Builder + Excalidraw API reference

Notes from driving these APIs through `obsidian eval`. Prefer runtime
introspection over this page if the two ever disagree — `window.MindMapBuilderAPI`
is minified and versioned independently of the docs.

## Runtime availability

Verified on Obsidian 1.13.7 with Excalidraw plugin 2.27.3 and MindMap Builder
v26.03.15. These globals existed in the renderer:

| Global | Notes |
|---|---|
| `app` | Obsidian app object |
| `window.ExcalidrawAutomate` | ready even before any drawing is open |
| `window.MindMapBuilderAPI` | present; `.ready()` returned `true` |
| `sleep(ms)` | available, but useless under `eval` (see below) |

Because `eval` cannot await, `sleep()` buys nothing in that context. Sequence
work as separate eval calls and poll the state global instead.

Probe before relying on anything:

```js
JSON.stringify({
  ea: typeof window.ExcalidrawAutomate,
  mmb: typeof window.MindMapBuilderAPI,
  ready: window.MindMapBuilderAPI ? window.MindMapBuilderAPI.ready() : null,
  methods: window.MindMapBuilderAPI ? window.MindMapBuilderAPI.listMethods() : null
})
```

## MindMapBuilderAPI

Every method except `ready()` and `getCapabilities()` returns an envelope:

```ts
{ ok: true, data: T } | { ok: false, error: { code: string, message: string, details?: any } }
```

Always check `.ok` before touching `.data`.

### Methods actually present in v26.03.15

Confirmed by `listMethods()` at runtime:

```
ready  listMethods  getErrorCodes  spec  help  validate  getCapabilities
setView  getView  getSelection  selectNode  setInputFieldDockStatus
getMindMapRoots  getMapInfo  getNodeText  performAction  refreshMapLayout
addNode  importMarkdown  exportMarkdown  toggleSubmapRoot
getMapConfig  setMapConfig
getBranchElementIds  getProjectElementIds  getElementIdsByRole
```

### Documented but NOT present in this version

The public docs describe global-config methods that this build does not
implement. Calling them throws `is not a function`, which is easy to mistake for
a bug in your own code:

- `getConfigSchema`
- `getGlobalConfig`
- `setGlobalConfig`

Check `listMethods()` before using anything from the docs. For styling, fall
back to `getElementIdsByRole()` plus ExcalidrawAutomate.

### Introspection

Useful, and minification-proof:

- `spec()` — machine-readable contract with parameter metadata
- `help('<method>')` — returns `{ method, summary, params, returns }`
- `listMethods()`
- `validate('<method>', args)` — returns `{ valid, errors, normalizedArgs }`.
  Call it before the real call; it catches bad payloads cheaply.

### Reading a map

```js
mmb.getMindMapRoots()                       // { rootIds: string[] }  -- empty array means no map yet
mmb.getMapInfo(nodeId)                      // { nodeId, rootId, settingsRootId, depth }
mmb.getNodeText(nodeId)                     // { nodeId, text, ontology }
mmb.getSelection()                          // { nodeId, elementIds }
mmb.getElementIdsByRole(rootId)             // { nodes, branchArrows, crossLinks, boundaries, decorations, boundTexts }
mmb.exportMarkdown({ nodeId, cut })         // { markdown }
```

`getMindMapRoots()` returning an empty `rootIds` is the reliable signal that the
canvas has no map yet — that is the branch where you create a root with
`addNode`.

### Writing a map

```js
await mmb.addNode({ text: 'Root', parentId?, ontology?, follow?, position? })
// -> { nodeId, arrowId, rootId }

await mmb.importMarkdown({ markdown, parentId? })
// -> { addedNodeIds: string[], rootId: string | null }
```

`importMarkdown` takes a markdown bullet hierarchy. Two spaces per level works:

```
- 四大组件
  - Activity
    - 生命周期
```

Pass `parentId` to graft the hierarchy under an existing node; omit it and a new
root is created. `addedNodeIds` includes ids for the intermediate nodes, so its
count exceeds the number of leaf lines — do not use it as a node count. Count
the markdown lines instead, and verify by reading the scene back.

### Layout and actions

```js
await mmb.refreshMapLayout(nodeId)
await mmb.performAction(mmb.Actions.FOLD_ALL)
```

Action constants seen in practice: `ADD`, `ADD_SIBLING_AFTER`,
`ADD_SIBLING_BEFORE`, `ADD_FOLLOW`, `ADD_FOLLOW_FOCUS`, `ADD_FOLLOW_ZOOM`,
`EDIT`, `PIN`, `BOX`, `TOGGLE_EMBED`, `TOGGLE_BOUNDARY`, `TOGGLE_SUBMAP_ROOT`,
`TOGGLE_GROUP`, `FOLD`, `FOLD_L1`, `FOLD_ALL`, `COPY`, `CUT`, `PASTE`, `ZOOM`,
`FOCUS`, `NAVIGATE*`, `SORT_ORDER`, `REARRANGE`, `DOCK_UNDOCK`, `HIDE`, `UNDO`,
`REDO_Z`, `REDO_Y`.

`getMapConfig()` errors with `NO_SELECTION` when nothing is selected. Select a
node first (`selectNode`) or pass a `nodeId`.

### Recurring error codes

`NO_VIEW`, `INVALID_VIEW`, `INVALID_NODE`, `NO_SELECTION`, `NO_ROOT`,
`INVALID_ACTION`, `INVALID_ARGUMENT`, `OPERATION_FAILED`. Resolve the full map
with `getErrorCodes()`.

## ExcalidrawAutomate essentials

```js
ea.setView(view)                  // pass a VIEW OBJECT, never the string 'active'
ea.targetView                     // verify .file.path after setting
ea.getViewElements()              // elements currently in the scene
ea.getViewSelectedElements()
ea.viewUpdateScene({ elements: [], appState: {} }, false)   // clear the canvas
ea.copyViewElementsToEAforEditing(elements)
ea.createPNG(templatePath, scale) // -> Promise<Blob>
ea.createSVG(...)                 // -> Promise<SVGSVGElement>
ea.getBoundingBox(elements)
ea.selectElementsInView(ids)
ea.decompressFromBase64(str)      // NO -- see caveat below
```

The scene-verification queries worth keeping handy (element census, text-label
dump, duplicate-view listing) are in `file-targeting.md` and the main workflow.

### `decompressFromBase64` caveat

`ea.decompressFromBase64(base64)` returned `null` for ordinary base64-encoded
UTF-8 text. It decompresses Excalidraw's compressed scene data, not arbitrary
strings. For your own payloads use `atob` + `Uint8Array` +
`TextDecoder('utf-8')`, as described in `execution-model.md`.
