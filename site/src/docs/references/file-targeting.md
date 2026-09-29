# Targeting the right file

Read this before your first write. It is the highest-consequence part of this
skill.

## The failure this prevents

ExcalidrawAutomate's convenience form addresses **whatever view is currently
active**:

```js
ea.setView('active');      // <-- dangerous
```

During this skill's development that line wrote a generated mind map into the
wrong vault file and destroyed the drawing that was there. The user had several
Excalidraw panes open; the intended target was opened and cleared earlier, but by
the time the import ran, a different pane had focus.

The general shape of the bug: **the file you opened is not necessarily the file
that is active.** Opening a file does not guarantee it stays active across
multiple eval calls, and the user may switch panes at any moment. Anything you
did in an earlier call may be undone by an intervening focus change.

So: never address a target implicitly.

## The pattern

Resolve the view by exact path, pass that view object to `setView`, and verify
the resolved identity before mutating.

```js
(function () {
  var want = 'Android/\u601d\u7ef4\u5bfc\u56fe.excalidraw.md';
  var e = window.ExcalidrawAutomate;

  var leaves = app.workspace.getLeavesOfType('excalidraw');
  var view = null;
  for (var i = 0; i < leaves.length; i++) {
    var f = leaves[i].view.file;
    if (f && f.path === want && !view) { view = leaves[i].view; }
  }
  if (!view) { return JSON.stringify({ err: 'view-not-found', want: want }); }

  e.setView(view);
  if (!e.targetView) { return JSON.stringify({ err: 'setview-failed' }); }

  var actual = e.targetView.file ? e.targetView.file.path : '?';
  if (actual !== want) {
    return JSON.stringify({ err: 'path-mismatch', want: want, actual: actual });
  }

  // ... only now mutate
})()
```

`New-TargetedCode` in `scripts/obsidian-eval.ps1` wraps a body in exactly this
prologue and exposes the verified path as the JS variable `actualPath`. Use it
instead of copying the block:

```powershell
$body = "return JSON.stringify({ actualPath: actualPath, els: e.getViewElements().length });"
$code = New-TargetedCode -TargetPath 'Android/思维导图.excalidraw.md' -Body $body
Invoke-ObsidianEval -Code $code
```

## Verify every call, not just the first

Focus can change between calls, so re-resolve and re-verify on each one. That
means the targeting prologue belongs in every eval that mutates the canvas —
which is why wrapping it in a function beats pasting it around.

Have the call return the resolved path so you can assert on it from the host
side. A result without `actualPath` matching your target is a failed call, not a
successful one.

## Diagnosing "which file am I actually editing?"

List what is open. Several panes can exist, including **duplicates of the same
file**:

```js
JSON.stringify(app.workspace.getLeavesOfType('excalidraw').map(function (l) {
  return l.view.file ? l.view.file.path : '?';
}))
```

If the target appears more than once, the first match wins in the loop above.
That is usually fine, but be aware that Excalidraw panes can hold unsaved scene
state — editing the "other" pane of the same file can produce surprising
ordering when autosave reconciles them. Prefer the pane the user is looking at
when duplicates exist.

## Before mutating, additionally

- **Confirm the file exists on disk** and note its size and mtime, so you can
  tell afterwards whether your change persisted.
- **Back it up**: `Copy-Item <file> <file>.bak`. Cheap, and it makes a mistake
  survivable.
- **Warn the user if the drawing is not empty.** Clearing a canvas is
  destructive and there is no undo across sessions.

## After mutating

Excalidraw autosaves on an interval (15s desktop by default). Confirm
persistence from the filesystem rather than looking for a save API:

```powershell
Get-Item 'F:\vault\Android\思维导图.excalidraw.md' | Select-Object Length, LastWriteTime
```

The frontmatter (`excalidraw-plugin: parsed`, `tags: [excalidraw]`) survives
programmatic edits; only the compressed data block changes. A file that grew
substantially after a large import is the expected result.
