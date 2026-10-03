$ErrorActionPreference = 'Continue'
Set-Location 'F:\cs_knowledge'

Write-Output '=== 1. scan every git-tracked file for secrets ==='
# `git ls-files` octal-escapes non-ASCII paths by default (e.g. "notes/Android/\345\..."),
# which makes Test-Path fail and silently SKIPS those files -- exactly the ones we
# care about. -z emits raw NUL-delimited UTF-8 paths instead.
$trackedRaw = git -c core.quotepath=false ls-files -z
$tracked = $trackedRaw -split "`0" | Where-Object { $_ -ne '' }
$hits = 0
$scanned = 0
foreach ($f in $tracked) {
  $full = Join-Path 'F:\cs_knowledge' $f
  if (-not (Test-Path -LiteralPath $full)) {
    Write-Output ("  !! could not resolve: $f")
    continue
  }
  $len = (Get-Item -LiteralPath $full).Length
  if ($len -gt 8MB) { continue }
  $scanned++
  $text = ''
  try { $text = [System.IO.File]::ReadAllText($full, [System.Text.Encoding]::UTF8) } catch { continue }
  $m = [regex]::Matches($text, 'sk-[A-Za-z0-9]{20,}')
  if ($m.Count -gt 0) {
    # Distinguish real keys from CSS class-name fragments inside minified JS.
    $real = $m | Where-Object { $_.Value.Length -ge 32 -and $_.Value -match '^sk-[0-9a-f]{32,}$' }
    Write-Output ("  $f : total=$($m.Count) looks-like-real-key=$($real.Count)")
    if ($real.Count -gt 0) {
      $hits += $real.Count
      $real | ForEach-Object { Write-Output ("      !! " + $_.Value.Substring(0,12) + "...") }
    }
  }
}
Write-Output ("  files scanned: $scanned / $($tracked.Count)")
Write-Output ("  real-key hits: $hits")

Write-Output ''
Write-Output '=== 2. confirm personal Obsidian state is NOT tracked ==='
$mustBeAbsent = @(
  'notes/.obsidian/workspace.json',
  'notes/.obsidian/workspaces.json',
  'notes/.obsidian/hotkeys.json',
  'notes/.obsidian/graph.json',
  'notes/.obsidian/appearance.json'
)
foreach ($p in $mustBeAbsent) {
  $isTracked = $tracked -contains $p
  Write-Output ("  {0,-40} tracked={1}" -f $p, $isTracked)
}

Write-Output ''
Write-Output '=== 3. confirm build artifacts are NOT tracked ==='
foreach ($p in 'site/node_modules', 'site/dist') {
  $n = ($tracked | Where-Object { $_ -like "$p/*" } | Measure-Object).Count
  Write-Output ("  {0,-24} tracked files={1}" -f $p, $n)
}

Write-Output ''
Write-Output '=== 4. size of what will be pushed ==='
$total = 0
foreach ($f in $tracked) {
  $full = Join-Path 'F:\cs_knowledge' $f
  if (Test-Path -LiteralPath $full) { $total += (Get-Item -LiteralPath $full).Length }
}
Write-Output ("  tracked files: " + $tracked.Count)
Write-Output ("  total size: " + [math]::Round($total/1MB, 2) + " MB")

Write-Output ''
Write-Output '=== 5. the committed Excalidraw plugin config ==='
Get-Content 'notes\.obsidian\plugins\obsidian-excalidraw-plugin\data.json' -Raw
