# Allows your phone to reach the Nimiq Bounty dev server over the hotspot.
#
# Right-click this file and choose "Run with PowerShell" as an administrator,
# or open an admin PowerShell and run it directly. It reports what it did and
# waits for a keypress so any error stays readable.
#
# Scope is deliberately narrow: one TCP port, and only from the hotspot subnet.
# Remove it later with:
#   Remove-NetFirewallRule -DisplayName 'Nimiq Bounty dev 5173'

$ErrorActionPreference = 'Stop'
$ruleName = 'Nimiq Bounty dev 5173'

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "This script needs to run as administrator." -ForegroundColor Red
        Write-Host "Right-click it and choose 'Run as administrator', then try again."
        Read-Host "Press Enter to close"
        exit 1
    }

    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Rule already exists. Nothing to do." -ForegroundColor Yellow
    }
    else {
        New-NetFirewallRule `
            -DisplayName $ruleName `
            -Direction Inbound `
            -Protocol TCP `
            -LocalPort 5173 `
            -RemoteAddress 172.19.118.0/24 `
            -Action Allow | Out-Null
        Write-Host "Created firewall rule '$ruleName'." -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Your phone should now be able to open:" -ForegroundColor Cyan
    Write-Host "  http://172.19.118.42:5173"
}
catch {
    Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Read-Host "Press Enter to close"
