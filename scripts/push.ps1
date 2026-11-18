# QAZAQ SPACE - safe commit + push
# Token is read from .secrets/token.txt and is NEVER written to git remote or config.
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\push.ps1 -Message "Update"

param(
  [string]$Message = "QAZAQ SPACE: update",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Windows may append ".txt" to the file name (token.txt.txt). Accept both.
$tokenCandidates = @(
  (Join-Path $root ".secrets\token.txt"),
  (Join-Path $root ".secrets\token.txt.txt")
)
$tokenFile = $tokenCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $tokenFile) {
  throw "Token file not found. Create .secrets/token.txt and paste a GitHub token into it."
}

$token = (Get-Content $tokenFile -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Token file is empty: $tokenFile"
}

# Git may not be in PATH right after installation.
$git = "git"
try { & $git --version *> $null } catch {
  $candidate = "C:\Program Files\Git\cmd\git.exe"
  if (Test-Path $candidate) { $git = $candidate } else { throw "Git not found." }
}

# Repo-local identity (does not touch global config).
$currentName = & $git config user.name
if ([string]::IsNullOrWhiteSpace($currentName)) {
  & $git config user.name "QAZAQ SPACE"
  & $git config user.email "qazaqspace@users.noreply.github.com"
}

& $git add -A
& $git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  & $git -c i18n.commitEncoding=utf-8 commit -m $Message
  if ($LASTEXITCODE -ne 0) { throw "Commit failed." }
} else {
  Write-Host "Nothing to commit."
}

$context = "protocol=https`nhost=github.com`n`n"
$credential = "protocol=https`nhost=github.com`nusername=x-access-token`npassword=$token`n`n"

# The token goes to git through stdin, not through a URL or command-line argument.
$credential | & $git credential approve
try {
  & $git push origin $Branch
  if ($LASTEXITCODE -ne 0) {
    throw "Push failed. Check that the token is valid and has Contents: Read and write for MagicBall3/qazaqspace."
  }
} finally {
  # Remove the token from the credential helper after the operation.
  $context | & $git credential reject
}

Write-Host "Done: changes pushed to origin/$Branch."
