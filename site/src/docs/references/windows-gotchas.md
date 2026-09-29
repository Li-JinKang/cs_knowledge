# Windows / PowerShell 5.1 transport

Problems specific to shipping JavaScript into Obsidian from a Windows shell. The
JavaScript-level constraints (IIFE, no await, quote stripping, payload encoding)
live in `execution-model.md` — this file is only about the host side.

## Transport recipe

`obsidian eval` takes the code as a command-line argument. It does **not** read
from stdin (`code=< file` reports `Missing required parameter: code`), so the
code has to survive being an argument.

Path that works reliably:

1. Write the code into a `.bat` file, **single line**, wrapped in double quotes.
2. Invoke it with `cmd /c`.
3. Parse stdout for the line starting with `=> `.

`scripts/obsidian-eval.ps1` implements this. Prefer dot-sourcing it over
rebuilding the plumbing.

```powershell
. .\obsidian-eval.ps1 -Exe 'C:\...\Obsidian.exe' -Vault 'MyVault'
Invoke-ObsidianEval -Code "JSON.stringify({ok:1})"
```

### Why a batch file

Calling the executable directly and capturing its output is unreliable from
PowerShell — `& $exe eval "code=$Code"` frequently returns **zero lines** even
though the command ran and printed a result. The `.bat` + `cmd /c` route does
not have this problem.

### Why single-line

Multi-line code inside a `.bat` argument is broken by cmd's parsing. Collapse the
template to one line before shipping it. Comments must go, or be written as
`/* ... */` inline.

### Why the command line must stay short

Roughly **1 KB is safe; a few KB fails intermittently**. Budget accordingly:
keep the template lean, ship bulk text as a base64 payload rather than inline
literals, and send one branch per call when importing a large map.

Attempting to dodge the limit with `set /p CODE=<file` inside the batch shim does
not work — it fails precisely for the long payloads you were trying to rescue.

## Symptom: no result, but the command clearly ran

Four causes, in rough order of likelihood:

1. **You returned a Promise.** `eval` does not await — see `execution-model.md`.
2. **The command line was too long.** Shorten it.
3. **Stdout was swallowed.** Use the batch-file transport.
4. **Genuine flakiness.** Retry 3–5 times. Occasional empty output happens with
   no discernible trigger.

The helper retries automatically.

## Symptom: output parsing picks up garbage

The CLI prints a banner before the result. If the installer is outdated it also
prints:

```
Your Obsidian installer is out of date. ... https://obsidian.md/download
```

That line contains `=>`, so naive `-like '=> *'` matching can capture it. It also
breaks PowerShell's `-f` operator with
`Error formatting a string: Input string was not in a correct format`.

**Match only lines that start with the prefix:**

```powershell
foreach ($line in $raw) {
  $s = [string]$line
  if ($s.StartsWith('=> ')) { return $s.Substring(3) }
}
```

And build log strings with concatenation, not `-f`:

```powershell
Write-Host ("[" + $i + "] " + $name + " -> " + $result)
```

The installer warning is harmless — it just means an older installer is paired
with a newer `app.asar`. It cannot be silenced, only ignored.

## Symptom: `Illegal characters in path` from `WriteAllText`

`[System.IO.File]::WriteAllText($path, $text, $enc)` can throw this for generated
shim filenames even when the path is a well-formed string, depending on the
process working-directory state.

**Use `Set-Content -LiteralPath ... -Encoding ASCII -NoNewline`.** Same bytes,
no failure.

## Symptom: non-ASCII text becomes `?` or mojibake

Three independent encoders can corrupt text before it reaches the renderer.

| Stage | Problem | Guard |
|---|---|---|
| PowerShell 5.1 reading a `.ps1` | reads BOM-less UTF-8 as ANSI, mangling non-ASCII literals and breaking syntax | keep driver scripts **pure ASCII**; build non-ASCII from code points (`[string][char]0x77E5`) |
| `ConvertTo-Json` | does not escape non-ASCII to `\uXXXX`, so correctness depends on downstream encoding | do not use it to build payloads; escape manually |
| `cmd.exe` / `chcp 65001` | argument encoding is unpredictable | keep the command line pure ASCII; ship non-ASCII as base64 |

The escape-then-base64 pattern in `execution-model.md` survives all three. The
helper's `ConvertTo-AsciiJsLiteral` and `Get-Base64Payload` implement it.

**Fingerprints that identify which stage corrupted things:**

- Output is `?` (char code 63) → an encoder replaced the characters outright;
  usually the `.ps1` was read as ANSI or a file was written with ASCII encoding.
  `Set-Content -Encoding ASCII` silently does this to non-ASCII content.
- Escapes look like random CJK ranges (`\u942d\u30e8\u7611`) instead of the code
  points you expected → something iterated the wrong thing. See below.
- The decoded string is longer than expected but readable-ish → UTF-8 bytes were
  decoded as another encoding.

## Symptom: iterating a StringBuilder corrupts text

```powershell
foreach ($ch in $sb) { ... }                  # WRONG - iterates chunks, not chars
foreach ($ch in $sb.ToString().ToCharArray()) # correct
```

Iterating a `StringBuilder` directly yields its internal chunks, which
double-encodes and turns `知识体系` into `\u942d\u30e8\u7611\u6d63...`.

**Index the source string instead:**

```powershell
for ($i = 0; $i -lt $Text.Length; $i++) { $ch = $Text[$i]; ... }
```

## Verifying the pipeline

Before any real work, push a known non-ASCII string end to end and check the code
points come back intact:

```powershell
# host side
$sanity = ([string][char]0x6D4B) + ([string][char]0x8BD5)   # 测试
# renderer side: length 2, charCodeAt(0) === 27979, charCodeAt(1) === 35797
```

`63` means the text was destroyed. Fix the pipeline before blaming the plugin.

## macOS / Linux

The JavaScript constraints are identical. The host-side problems largely vanish:
a POSIX shell passes space-containing arguments reliably, so no batch shim is
needed and code pages are a non-issue. Write the code to a temp file and pass it
as one argument, or pass it inline — either works. Confirm the CLI is the same
build (`obsidian version`) before assuming subcommand parity.
