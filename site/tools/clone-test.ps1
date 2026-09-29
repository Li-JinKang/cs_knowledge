$ErrorActionPreference = 'Stop'

# Simulate a fresh clone: copy ONLY the files git would ship (git archive
# honours .gitignore via the index), then inspect whether the result is a
# coherent Obsidian vault.
$tmp = 'F:\cs_knowledge-clone-test'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

Set-Location 'F:\cs_knowledge'
git archive HEAD 2>$null | Out-Null   # may be empty before first commit
if ($LASTEXITCODE -ne 0) {
  # No commit yet -- materialise the index instead.
  $files = git -c core.quotepath=false ls-files -z -split "`0" | Where-Object { $_ -ne '' }
} else {
  $files = $null
}

if ($files) {
  foreach ($f in $files) {
    $src = Join-Path 'F:\cs_knowledge' $f
    $dst = Join-Path $tmp $f
    $dir = Split-Path $dst -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
}

Write-Host '=== cloned tree (top level) ==='
Get-ChildItem $tmp -Force | Select-Object Mode, Name | Format-Table -AutoSize | Out-String | Write-Host

Write-Host '=== is it recognisable as an Obsidian vault? ==='
$obs = Join-Path $tmp '.obsidian'
Write-Host ("  .obsidian/ exists          : " + (Test-Path $obs))
Write-Host ("  community-plugins.json     : " + (Test-Path (Join-Path $obs 'community-plugins.json')))
Write-Host ("  app.json                   : " + (Test-Path (Join-Path $obs 'app.json')))
Write-Host ("  core-plugins.json          : " + (Test-Path (Join-Path $obs 'core-plugins.json')))

Write-Host ''
Write-Host '=== is MindMap Builder wired up in the clone? ==='
$pluginDir = Join-Path $obs 'plugins\obsidian-excalidraw-plugin'
foreach ($f in 'main.js', 'manifest.json', 'styles.css', 'data.json') {
  $p = Join-Path $pluginDir $f
  $ok = Test-Path $p
  $sz = if ($ok) { [math]::Round((Get-Item $p).Length/1KB, 1).ToString() + ' KB' } else { '-' }
  Write-Host ("  {0,-16} {1,-8} {2}" -f $f, $ok, $sz)
}

$enabled = Get-Content (Join-Path $obs 'community-plugins.json') -Raw | ConvertFrom-Json
Write-Host ("  enabled plugins: " + ($enabled -join ', '))

$cfg = Get-Content (Join-Path $pluginDir 'data.json') -Raw | ConvertFrom-Json
Write-Host ("  sidepanelTabs  : " + ($cfg.sidepanelTabs -join ' | '))

$script = Join-Path $tmp 'Excalidraw\Scripts\Downloaded\Mindmap Builder.md'
Write-Host ("  script present : " + (Test-Path $script))

Write-Host ''
Write-Host '=== can the drawing be read? ==='
$drawing = Join-Path $tmp 'Android\思维导图.excalidraw.md'
Write-Host ("  drawing present: " + (Test-Path $drawing))
if (Test-Path $drawing) {
  $txt = [System.IO.File]::ReadAllText($drawing, [System.Text.Encoding]::UTF8)
  Write-Host ("  has compressed-json block: " + ($txt -match '```compressed-json'))
  Write-Host ("  size: " + [math]::Round((Get-Item $drawing).Length/1KB, 1) + " KB")
}

Write-Host ''
Write-Host '=== site sources present in the clone? ==='
foreach ($p in 'site\package.json', 'site\src\scene.json', 'site\src\MindMap.jsx', 'site\vite.config.js', '.github\workflows\pages.yml') {
  Write-Host ("  {0,-36} {1}" -f $p, (Test-Path (Join-Path $tmp $p)))
}

Remove-Item $tmp -Recurse -Force
Write-Host ''
Write-Host 'clone test cleaned up'
