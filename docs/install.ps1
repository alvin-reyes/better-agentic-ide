<#
.SYNOPSIS
  Install ADE on Windows.

.DESCRIPTION
  irm https://ade.ardata.tech/install.ps1 | iex

  Resolves the latest release, downloads the installer for this machine,
  verifies it against the release's SHA256SUMS, and runs it.

.PARAMETER Version
  Install a specific release tag (e.g. v0.18.2) instead of the latest.

.PARAMETER DryRun
  Resolve and verify the download, then stop without installing.

.PARAMETER Quiet
  Run the MSI without its UI. Requires an elevated shell.

.EXAMPLE
  irm https://ade.ardata.tech/install.ps1 | iex

.EXAMPLE
  # With options, the script has to be saved first:
  irm https://ade.ardata.tech/install.ps1 -OutFile install.ps1
  .\install.ps1 -Version v0.18.2 -DryRun
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute(
  'PSAvoidUsingWriteHost', '',
  Justification = 'An installer writes to the terminal for a person to read, in colour. Write-Output would put this on the pipeline, where it is not wanted.'
)]
[CmdletBinding()]
param(
  [string]$Version,
  [switch]$DryRun,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Repo = 'alvin-reyes/better-agentic-ide'
$Api  = "https://api.github.com/repos/$Repo/releases"

function Write-Head($m) { Write-Host $m -ForegroundColor White }
function Write-Info($m) { Write-Host "  $m" }
function Write-Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }
# Prints the reason and exits 1. Named Write- rather than Stop- because Stop is
# a state-changing verb in PowerShell and the analyser then expects
# ShouldProcess support, which a message-and-exit helper has no use for.
function Write-Fail($m) { Write-Host "  $m" -ForegroundColor Red; exit 1 }

# TLS 1.2 is not the default on older Windows PowerShell and GitHub requires it.
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
  # Already the default on PowerShell 7, where this type may not be settable.
  # Not fatal: if TLS really is unavailable the download fails with a clear error.
  Write-Verbose "could not set TLS 1.2 explicitly: $_"
}

Write-Head 'ADE installer'

# --- platform --------------------------------------------------------------
$arch = $env:PROCESSOR_ARCHITECTURE
switch ($arch) {
  'AMD64' { $archLabel = 'x64' }
  'ARM64' { $archLabel = 'arm64' }
  default { Write-Fail "unsupported architecture: $arch" }
}
Write-Info "platform: Windows ($archLabel)"

# --- release ---------------------------------------------------------------
$metaUrl = if ($Version) { "$Api/tags/$Version" } else { "$Api/latest" }

try {
  $meta = Invoke-RestMethod -Uri $metaUrl -Headers @{ 'User-Agent' = 'ade-installer' }
} catch {
  # A missing tag and an unreachable API fail the same way; telling someone the
  # network is down when they mistyped a version sends them to the wrong place.
  try {
    Invoke-RestMethod -Uri "$Api/latest" -Headers @{ 'User-Agent' = 'ade-installer' } | Out-Null
    Write-Fail "no release tagged $Version. See https://github.com/$Repo/releases"
  } catch {
    Write-Fail "could not reach the GitHub release API. Download manually from https://github.com/$Repo/releases/latest"
  }
}

Write-Info "version:  $($meta.tag_name)"

# Prefer the MSI; fall back to the NSIS .exe if that is what was published.
$asset = $meta.assets | Where-Object { $_.name -like '*.msi' } | Select-Object -First 1
if (-not $asset) {
  $asset = $meta.assets | Where-Object { $_.name -like '*-setup.exe' -or $_.name -like '*.exe' } | Select-Object -First 1
}

if (-not $asset) {
  Write-Warn "this release publishes no Windows installer."
  Write-Warn "Windows builds are not produced yet - see https://github.com/$Repo/issues/22."
  Write-Fail "Nothing to install. macOS and Linux are available today."
}

$sums = $meta.assets | Where-Object { $_.name -eq 'SHA256SUMS' } | Select-Object -First 1

# --- download --------------------------------------------------------------
$tmp  = Join-Path ([IO.Path]::GetTempPath()) ("ade-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
$file = Join-Path $tmp $asset.name

try {
  Write-Head 'Downloading'
  Write-Info $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file -UseBasicParsing

  # --- verify --------------------------------------------------------------
  Write-Head 'Verifying'
  if ($sums) {
    $sumsText = (Invoke-WebRequest -Uri $sums.browser_download_url -UseBasicParsing).Content
    $want = $null
    foreach ($line in $sumsText -split "`n") {
      $parts = $line.Trim() -split '\s+'
      if ($parts.Count -ge 2 -and $parts[-1] -eq $asset.name) { $want = $parts[0]; break }
    }
    if (-not $want) { Write-Fail "SHA256SUMS has no entry for $($asset.name)" }

    $have = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLower()
    if ($have -ne $want.ToLower()) {
      Write-Fail "checksum mismatch - refusing to install. Expected $want, got $have"
    }
    Write-Info 'sha256 matches'
  } else {
    Write-Warn 'this release publishes no SHA256SUMS, so the download cannot be'
    Write-Warn 'verified beyond HTTPS.'
  }

  if ($DryRun) {
    Write-Head 'Dry run'
    Write-Info "would install $($asset.name) ($($meta.tag_name)) for Windows ($archLabel)"
    Write-Info 'nothing was changed'
    exit 0
  }

  # --- install -------------------------------------------------------------
  Write-Head 'Installing'
  if ($file -like '*.msi') {
    $msiArgs = @('/i', "`"$file`"")
    if ($Quiet) { $msiArgs += @('/quiet', '/norestart') }
    $p = Start-Process msiexec.exe -ArgumentList $msiArgs -Wait -PassThru
    # 3010 is success-but-reboot-required, not a failure.
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
      Write-Fail "the installer exited with code $($p.ExitCode)"
    }
    if ($p.ExitCode -eq 3010) { Write-Warn 'a restart is required to finish' }
  } else {
    $p = Start-Process $file -Wait -PassThru
    if ($p.ExitCode -ne 0) { Write-Fail "the installer exited with code $($p.ExitCode)" }
  }

  Write-Head 'Done'
  Write-Info 'Launch ADE from the Start menu.'
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
