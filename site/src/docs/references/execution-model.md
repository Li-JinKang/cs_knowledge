# The `eval` execution model

`obsidian eval code=<javascript>` reads like a one-liner and is not. These
constraints are properties of the command itself — they apply on every platform.
Platform-specific transport problems are in `windows-gotchas.md`.

## It evaluates an expression, not a script

A top-level `return` fails with `Illegal return statement`. Wrap your logic:

```js
(function () { return JSON.stringify({ ok: 1 }); })()
```

The last expression's value is what the CLI prints, prefixed with `=> `.

## It cannot await

An `async` IIFE returns a pending Promise and the CLI prints **nothing**. There
is no way to make `eval` wait, and `sleep()` is therefore useless inside it.

Split async work across two calls: fire it, park the outcome on a global, then
poll in a separate eval.

```js
// call 1 -- fire
window.__R = { status: 'running' };
mmb.importMarkdown({ markdown: md, parentId: rootId })
   .then(function (x) { window.__R = { status: 'ok', result: x }; })
   .catch(function (e) { window.__R = { status: 'error', message: String(e) }; });
JSON.stringify({ fired: 1 });
```

```js
// call 2 -- poll until status is 'ok' or 'error'
JSON.stringify({ s: window.__R ? window.__R.status : 'none' })
```

The bundled `Wait-ObsidianState` implements the poll loop.

Keep the firing template **short**. It shares a command-line budget with the
payload, and it is the part that gets retried.

## Double quotes are stripped from the code

The CLI removes `"` characters from the `code=` argument before evaluating.

```js
JSON.stringify({a: "Android/x"})   // Error: Android is not defined
JSON.stringify({a: 'Android/x'})   // {"a":"Android/x"}
```

`"Android/x"` arrives as `Android/x` — a division between two undefined
identifiers. The first one throws.

**Write every JavaScript string literal with single quotes.** For the same
reason, avoid backslash escapes (`\uXXXX`, `\x2f`) in code passed on the command
line. If you need a special character, produce it in JS
(`String.fromCharCode(0x2F)`) or build it on the host side.

## Sending bulk text: escape, then base64

Any non-ASCII text (Chinese labels, accented characters) is at risk from console
code pages and argument encoding. The pattern that survives every encoder:

1. Escape the text into a **pure-ASCII** JavaScript single-quoted string literal,
   converting non-ASCII to `\uXXXX`.
2. Base64 that ASCII literal.
3. In the renderer, decode the bytes and `eval()` the result.

```powershell
$literal = ConvertTo-AsciiJsLiteral -Text $markdown   # 'Android \u77e5\u8bc6...'
$b64     = Get-Base64Payload -Text $markdown
```

```js
var bin = atob('__PAYLOAD__');
var bytes = new Uint8Array(bin.length);
for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
var text = eval(new TextDecoder('utf-8').decode(bytes));
```

Two details that matter:

- **Base64 decodes to bytes, not text.** Encode UTF-8 bytes, decode with
  `TextDecoder('utf-8')`. Encoding UTF-16 code units and decoding as UTF-8 gives
  mojibake.
- **The payload must be `eval`'d in the renderer.** Without it, `\u77e5` stays a
  literal backslash sequence and your mind map node is labelled `\u77e5\u8bc6`.
  This is the single most common cause of an import that "succeeds" but looks
  wrong.

## Why `eval` is the right tool here, and when it is not

The escape-then-eval trick is safe because the newlines in the literal are `\n`
**escapes**, not raw characters. `eval` turns them into real newlines *as data*,
which is what markdown needs.

The trap is the reverse: **never `eval` a string that already contains real
newline characters.** `eval` parses them as syntax, and a markdown outline gets
shredded into invalid code before the plugin ever sees it. If your outline
silently collapses into a single node, this is why.

For ordinary vault work — reading, creating, appending to notes, searching,
listing properties, running a command by id — use the CLI's dedicated
subcommands (`read`, `create`, `append`, `search`, `properties`, `command`,
`plugins`). They are simpler and avoid this entire class of problem. Reach for
`eval` only when you need a plugin API that has no subcommand.

## Debugging checklist

When an eval produces nothing or nonsense:

1. Did you return a Promise? An async IIFE prints nothing.
2. Are there double quotes in the code? They were stripped — switch to single.
3. Is the command line too long? See `windows-gotchas.md`.
4. Did stdout get swallowed by the host shell? See `windows-gotchas.md`.
5. Do you have a `return` at top level instead of inside an IIFE?
6. Is it genuine flakiness? Retry a few times; occasional empty output happens.

A cheap sanity check before any real work: send a tiny two-character non-ASCII
string through the full pipeline and assert the character codes come out right.

```
测试  ->  length 2, charCodeAt(0) === 27979, charCodeAt(1) === 35797
```

If you get `63` (`?`), an encoder already destroyed the text and nothing
downstream will fix it.
