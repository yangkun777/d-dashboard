#Requires -RunAsAdministrator
param([string]$InterfaceAlias = '以太网')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$statusFile = Join-Path $projectRoot '.local-deploy/lan-firewall-status.json'
try {
    $nginxExe = Join-Path $projectRoot '.local-deploy/nginx-1.31.8/nginx.exe'
    if (-not (Test-Path -LiteralPath $nginxExe)) { throw '找不到本项目的 Nginx。请先启动本机部署。' }
    $null = Get-NetAdapter -Name $InterfaceAlias -ErrorAction Stop
    $ruleName = 'DEGSON-Dashboard-LAN-8080'
    if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name $ruleName -DisplayName 'DEGSON 技术支持看板 · 局域网 8080' -Direction Inbound -Action Allow -Enabled True -Profile Any -Protocol TCP -LocalPort 8080 -Program $nginxExe -RemoteAddress LocalSubnet -InterfaceAlias $InterfaceAlias | Out-Null
    } else {
        Enable-NetFirewallRule -Name $ruleName
    }
    @{ success = $true; port = 8080; interface = $InterfaceAlias } | ConvertTo-Json | Set-Content -LiteralPath $statusFile -Encoding UTF8
} catch {
    @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath $statusFile -Encoding UTF8
    throw
}
