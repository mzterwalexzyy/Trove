# Lets your phone reach the Trove dev server over the hotspot.
#
# Right-click and "Run as administrator". It reports what it did and waits for
# a keypress, so errors stay readable instead of vanishing with the window.
#
# The hotspot subnet changes whenever the phone re-issues a DHCP lease, so this
# detects the current Wi-Fi subnet rather than hardcoding one, and replaces any
# stale rule from a previous session.
#
# Remove it later with:
#   Remove-NetFirewallRule -DisplayName 'Trove dev 5173'

$ErrorActionPreference = 'Stop'
$ruleName = 'Trove dev 5173'
$port = 5173

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host 'This script needs administrator rights.' -ForegroundColor Red
        Write-Host "Right-click it and choose 'Run as administrator', then try again."
        Read-Host 'Press Enter to close'
        exit 1
    }

    $wifi = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.InterfaceAlias -eq 'Wi-Fi' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -First 1

    if (-not $wifi) {
        Write-Host 'No Wi-Fi IPv4 address found. Connect to your phone hotspot first.' -ForegroundColor Red
        Read-Host 'Press Enter to close'
        exit 1
    }

    $ip = $wifi.IPAddress
    $octets = $ip.Split('.')
    $subnet = "$($octets[0]).$($octets[1]).$($octets[2]).0/24"

    Write-Host "Wi-Fi address : $ip"
    Write-Host "Allowing from : $subnet"
    Write-Host ''

    # Remove any rule from a previous session; its subnet is probably stale.
    foreach ($stale in @($ruleName, 'Nimiq Bounty dev 5173')) {
        $existing = Get-NetFirewallRule -DisplayName $stale -ErrorAction SilentlyContinue
        if ($existing) {
            Remove-NetFirewallRule -DisplayName $stale
            Write-Host "Removed stale rule '$stale'." -ForegroundColor Yellow
        }
    }

    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $port `
        -RemoteAddress $subnet `
        -Action Allow | Out-Null

    Write-Host "Created firewall rule '$ruleName'." -ForegroundColor Green
    Write-Host ''
    Write-Host 'Open this in Nimiq Pay -> Mini Apps:' -ForegroundColor Cyan
    Write-Host "  http://${ip}:${port}"
}
catch {
    Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Read-Host 'Press Enter to close'
