$ErrorActionPreference = 'Continue'

# Build the Chinese folder/file name from code points rather than embedding the
# literal. PowerShell 5.1 reads a BOM-less script as ANSI, which mangles any
# non-ASCII literal in the source and produces bogus "file missing" results.
$cn = -join (0x601D, 0x7EF4, 0x5BFC, 0x56FE | ForEach-Object { [char]$_ })   # 思维导图
$drawingRel = "Android\$cn.excalidraw.md"

# Simulate a fresh clone. `git archive` emits exactly the tracked content of a
# commit, so anything .gitignore excludes is genuinely absent -- the same view a
# new user would get after `git clone`.
$tmp = 'F:\cs_knowledge-clone-test'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

Set-Location 'F:\cs_knowledge'
$zip = Join-Path $env:TEMP 'cs-knowledge-archive.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
git archive --format=zip -o $zip HEAD
if (-not (Test-Path $zip)) { Write-Host 'git archive failed'; exit 1 }
Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
Remove-Item $zip -Force

Write-Host '=== cloned tree (top level) ==='
Get-ChildItem $tmp -Force | Select-Object Mode, Name | Format-Table -AutoSize | Out-String | Write-Host

Write-Host '=== is it recognisable as an Obsidian vault? ==='
$obs = Join-Path $tmp '.obsidian'
foreach ($f in 'community-plugins.json', 'app.json', 'core-plugins.json') {
  Write-Host ("  {0,-28} {1}" -f $f, (Test-Path (Join-Path $obs $f)))
}

Write-Host ''
Write-Host '=== is MindMap Builder wired up in the clone? ==='
$pluginDir = Join-Path $obs 'plugins\obsidian-excalidraw-plugin'
foreach ($f in 'main.js', 'manifest.json', 'styles.css', 'data.json') {
  $p = Join-Path $pluginDir $f
  $ok = Test-Path $p
  $sz = if ($ok) { [math]::Round((Get-Item $p).Length / 1KB, 1).ToString() + ' KB' } else { '-' }
  Write-Host ("  {0,-16} {1,-6} {2}" -f $f, $ok, $sz)
}

$cpPath = Join-Path $obs 'community-plugins.json'
if (Test-Path $cpPath) {
  $enabled = Get-Content $cpPath -Raw | ConvertFrom-Json
  Write-Host ("  enabled plugins : " + ($enabled -join ', '))
}
$cfgPath = Join-Path $pluginDir 'data.json'
if (Test-Path $cfgPath) {
  $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
  Write-Host ("  sidepanelTabs   : " + ($cfg.sidepanelTabs -join ' | '))
}
Write-Host ("  builder script  : " + (Test-Path (Join-Path $tmp 'Excalidraw\Scripts\Downloaded\Mindmap Builder.md')))

Write-Host ''
Write-Host '=== can the drawing be read? ==='
$drawing = Join-Path $tmp $drawingRel
Write-Host ("  drawing present : " + (Test-Path -LiteralPath $drawing))
if (Test-Path -LiteralPath $drawing) {
  $txt = [System.IO.File]::ReadAllText($drawing, [System.Text.Encoding]::UTF8)
  Write-Host ("  has scene block : " + ($txt -match '```compressed-json'))
  Write-Host ("  size            : " + [math]::Round((Get-Item -LiteralPath $drawing).Length / 1KB, 1) + " KB")
}

Write-Host ''
Write-Host '=== site sources present in the clone? ==='
foreach ($p in 'site\package.json', 'site\package-lock.json', 'site\src\scene.json', 'site\src\MindMap.jsx', 'site\vite.config.js', '.github\workflows\pages.yml', 'README.md') {
  Write-Host ("  {0,-36} {1}" -f $p, (Test-Path (Join-Path $tmp $p)))
}

Write-Host ''
Write-Host '=== personal state correctly ABSENT from the clone? ==='
foreach ($p in '.obsidian\workspace.json', '.obsidian\workspaces.json', '.obsidian\hotkeys.json', '.obsidian\appearance.json', 'site\node_modules', 'site\dist') {
  $present = Test-Path (Join-Path $tmp $p)
  Write-Host ("  {0,-36} present={1}" -f $p, $present)
}

Write-Host ''
Write-Host '=== can the cloned site build? ==='
Push-Location (Join-Path $tmp 'site')
$out = & npm ci --no-fund --no-audit 2>&1 | Select-Object -Last 2
Write-Host ("  npm ci: " + ($out -join ' '))
$build = & npm run build 2>&1 | Select-Object -Last 2
Write-Host ("  build : " + ($build -join ' '))
Pop-Location

Remove-Item $tmp -Recurse -Force
Write-Host ''
Write-Host 'clone test cleaned up'
