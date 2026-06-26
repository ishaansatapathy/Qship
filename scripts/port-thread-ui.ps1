$ErrorActionPreference = "Stop"
$src = "C:\Users\IshaanSatapathy\Desktop\Corsair Hackathon\apps\web"
$dst = "C:\Users\IshaanSatapathy\Desktop\hatho se buni hui bra\apps\web"

function Transform-Content([string]$text) {
  $text = $text -replace 'ThreadLanding', 'QshipLanding'
  $text = $text -replace 'ThreadAuthProvider', 'QshipAuthProvider'
  $text = $text -replace 'ThreadAuthScreen', 'QshipAuthScreen'
  $text = $text -replace 'ThreadAuthCard', 'QshipAuthCard'
  $text = $text -replace 'ThreadAppShell', 'QshipAppShell'
  $text = $text -replace 'ThreadCommand', 'QshipCommand'
  $text = $text -replace 'ThreadGmailConnect', 'QshipGmailConnect'
  $text = $text -replace 'ThreadCalendarConnect', 'QshipCalendarConnect'
  $text = $text -replace 'ThreadWordmark', 'QshipWordmark'
  $text = $text -replace 'ThreadLogoMark', 'QshipLogoMark'
  $text = $text -replace 'ThreadNav', 'QshipNav'
  $text = $text -replace 'ThreadHero', 'QshipHero'
  $text = $text -replace 'ThreadMarquee', 'QshipMarquee'
  $text = $text -replace 'ThreadProcess', 'QshipProcess'
  $text = $text -replace 'ThreadIntegrations', 'QshipIntegrations'
  $text = $text -replace 'ThreadShowcase', 'QshipShowcase'
  $text = $text -replace 'ThreadWorkflows', 'QshipWorkflows'
  $text = $text -replace 'ThreadRotator', 'QshipRotator'
  $text = $text -replace 'ThreadCapabilities', 'QshipCapabilities'
  $text = $text -replace 'ThreadAgent', 'QshipAgent'
  $text = $text -replace 'ThreadFaq', 'QshipFaq'
  $text = $text -replace 'ThreadCta', 'QshipCta'
  $text = $text -replace 'ThreadFooter', 'QshipFooter'
  $text = $text -replace 'ThreadAgentDemo', 'QshipAgentDemo'
  $text = $text -replace 'FlowDottedConnectors', 'FlowDottedConnectors'
  $text = $text -replace 'InViewAnnotation', 'InViewAnnotation'
  $text = $text -replace 'useThreadAuth', 'useQshipAuth'
  $text = $text -replace 'useThreadUser', 'useQshipUser'
  $text = $text -replace 'ThreadAuthProviderInner', 'QshipAuthProviderInner'
  $text = $text -replace '~/components/thread/', '~/components/qship/'
  $text = $text -replace '\./thread-', './qship-'
  $text = $text -replace '"\./thread\.css"', '"./qship.css"'
  $text = $text -replace 'thread-app-shell', 'qship-app-shell'
  $text = $text -replace 'thread-command', 'qship-command'
  $text = $text -replace 'thread-gmail-connect', 'qship-gmail-connect'
  $text = $text -replace 'thread-calendar-connect', 'qship-calendar-connect'
  $text = $text -replace 'use-thread-user', 'use-qship-user'
  $text = $text -replace 'thread-app\.css', 'qship-app.css'
  $text = $text -replace 'thread\.css', 'qship.css'
  $text = $text -replace '--thread-', '--qship-'
  $text = $text -replace '\.thread-', '.qship-'
  $text = $text -replace 'thread-page', 'qship-page'
  $text = $text -replace '--font-thread-hero', '--font-qship-hero'
  $text = $text -replace '/thread-logo\.svg', '/mascot-standing.png'
  $text = $text -replace 'Thread —', 'Qship —'
  $text = $text -replace 'Log in to Thread', 'Log in to Qship'
  $text = $text -replace 'Open Thread', 'Open Qship'
  $text = $text -replace 'No Threads yet', 'No items yet'
  # blue -> red
  $text = $text -replace '#3b82f6', '#e31e24'
  $text = $text -replace '#2563eb', '#ff3b42'
  $text = $text -replace '#1d4ed8', '#b8181d'
  $text = $text -replace '#1e40af', '#8b1519'
  $text = $text -replace '#1e3a8a', '#8b1519'
  $text = $text -replace '#60a5fa', '#ff6b6f'
  $text = $text -replace '#93c5fd', '#ff6b6f'
  $text = $text -replace '#6ea8ff', '#ff3b42'
  $text = $text -replace '#6ea8fe', '#ff3b42'
  $text = $text -replace 'rgba\(59,\s*130,\s*246,', 'rgba(227, 30, 36,'
  $text = $text -replace 'rgba\(96,\s*165,\s*250,', 'rgba(227, 30, 36,'
  $text = $text -replace 'rgba\(66,\s*133,\s*244,', 'rgba(227, 30, 36,'
  return $text
}

function Copy-Transform($from, $to) {
  $dir = Split-Path $to -Parent
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  if ($from -match '\.(tsx?|css|js|mjs|json)$') {
    $raw = [System.IO.File]::ReadAllText($from)
    [System.IO.File]::WriteAllText($to, (Transform-Content $raw))
  } else {
    Copy-Item $from $to -Force
  }
}

# qship components from thread
Get-ChildItem "$src\components\thread" -File | ForEach-Object {
  $name = $_.Name -replace '^thread-', 'qship-'
  Copy-Transform $_.FullName "$dst\components\qship\$name"
}

# app components from thread
Get-ChildItem "$src\components\app" -File | ForEach-Object {
  $name = $_.Name -replace '^thread-', 'qship-'
  if ($name -eq 'use-thread-user.ts') { $name = 'use-qship-user.ts' }
  Copy-Transform $_.FullName "$dst\components\app\$name"
}

# ui kit
if (Test-Path "$src\components\ui") {
  New-Item -ItemType Directory -Path "$dst\components\ui" -Force | Out-Null
  Get-ChildItem "$src\components\ui" -File -Recurse | ForEach-Object {
    $rel = $_.FullName.Substring("$src\components\ui\".Length)
    Copy-Transform $_.FullName "$dst\components\ui\$rel"
  }
}

# lib + hooks
@('lib', 'hooks') | ForEach-Object {
  if (Test-Path "$src\$_") {
    New-Item -ItemType Directory -Path "$dst\$_" -Force | Out-Null
    Get-ChildItem "$src\$_" -File | ForEach-Object {
      Copy-Transform $_.FullName "$dst\$_\$($_.Name)"
    }
  }
}

# (app) routes
$appDst = "$dst\app\(app)"
if (Test-Path $appDst) { Remove-Item $appDst -Recurse -Force }
Copy-Item "$src\app\(app)" $appDst -Recurse -Force
Get-ChildItem -LiteralPath $appDst -Recurse -File | Where-Object { $_.Extension -match '\.(tsx?|css)$' } | ForEach-Object {
  $path = $_.FullName
  $raw = [System.IO.File]::ReadAllText($path)
  [System.IO.File]::WriteAllText($path, (Transform-Content $raw))
}

# sign-in, check-email, privacy, api-auth, global-error
@(
  'sign-in\page.tsx',
  'check-email\page.tsx',
  'privacy\layout.tsx',
  'privacy\page.tsx',
  'global-error.tsx'
) | ForEach-Object {
  if (Test-Path "$src\app\$_") {
    Copy-Transform "$src\app\$_" "$dst\app\$_"
  }
}

if (Test-Path "$src\app\api-auth") {
  if (Test-Path "$dst\app\api-auth") { Remove-Item "$dst\app\api-auth" -Recurse -Force }
  Copy-Item "$src\app\api-auth" "$dst\app\api-auth" -Recurse -Force
}

if (Test-Path "$src\app\api\avatar") {
  New-Item -ItemType Directory -Path "$dst\app\api\avatar" -Force | Out-Null
  Copy-Transform "$src\app\api\avatar\route.ts" "$dst\app\api\avatar\route.ts"
}

# page + layout + providers
Copy-Transform "$src\app\page.tsx" "$dst\app\page.tsx"
Copy-Transform "$src\app\layout.tsx" "$dst\app\layout.tsx"
Copy-Transform "$src\providers\global.tsx" "$dst\providers\global.tsx"
Copy-Transform "$src\app\globals.css" "$dst\app\globals.css"

# assets
Copy-Item "$src\public\mascot.webm" "$dst\public\mascot.webm" -Force -ErrorAction SilentlyContinue
Copy-Item "$src\app\icon.svg" "$dst\app\icon.svg" -Force -ErrorAction SilentlyContinue

Write-Host "Port complete."
