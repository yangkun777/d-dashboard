param(
    [ValidateSet('start', 'stop')]
    [string]$Action = 'start',
    [switch]$Lan
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$localRoot = Join-Path $projectRoot '.local-deploy'
$nginxVersion = '1.31.8'
$nginxHome = Join-Path $localRoot "nginx-$nginxVersion"
$nginxExe = Join-Path $nginxHome 'nginx.exe'
$nginxConfig = Join-Path $nginxHome 'conf/local.conf'
$apiPidFile = Join-Path $localRoot 'api.pid'
$apiPort = 3001
$sitePort = 8080
$listenAddress = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }

function Stop-LocalDeployment {
    if (Test-Path $nginxExe) {
        & $nginxExe -p ($nginxHome.Replace('\', '/') + '/') -c 'conf/local.conf' -s quit 2>$null
    }
    if (Test-Path $apiPidFile) {
        $apiPid = [int](Get-Content $apiPidFile -Raw)
        $apiProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $apiPid" -ErrorAction SilentlyContinue
        if ($apiProcess -and $apiProcess.Name -eq 'node.exe' -and $apiProcess.CommandLine -like '*dist-server/index.js*') {
            Stop-Process -Id $apiPid -ErrorAction SilentlyContinue
        }
        Remove-Item -LiteralPath $apiPidFile -ErrorAction SilentlyContinue
    }
}

if ($Action -eq 'stop') {
    Stop-LocalDeployment
    Write-Host '本机演练服务已停止。'
    exit 0
}

New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
foreach ($port in @($apiPort, $sitePort)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "端口 $port 已被占用。请先运行本脚本 -Action stop，或检查占用该端口的程序。"
    }
}

Push-Location $projectRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw '生产构建失败' }
} finally {
    Pop-Location
}

if (-not (Test-Path $nginxExe)) {
    $archive = Join-Path $localRoot "nginx-$nginxVersion.zip"
    Invoke-WebRequest "https://nginx.org/download/nginx-$nginxVersion.zip" -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $localRoot
}

$distRoot = (Join-Path $projectRoot 'dist').Replace('\', '/')
$configText = @'
worker_processes 1;
pid logs/local-nginx.pid;
events { worker_connections 1024; }
http {
    include mime.types;
    default_type application/octet-stream;
    server {
        listen __LISTEN_ADDRESS__:__SITE_PORT__;
        server_name localhost;
        root "__DIST_ROOT__";
        index index.html;
        location /api/bi/ {
            proxy_pass http://127.0.0.1:__API_PORT__;
            proxy_read_timeout 30s;
        }
        location /assets/ { try_files $uri =404; }
        location / { try_files $uri $uri/ /index.html; }
    }
}
'@
$configText = $configText.Replace('__LISTEN_ADDRESS__', $listenAddress).Replace('__SITE_PORT__', "$sitePort").Replace('__API_PORT__', "$apiPort").Replace('__DIST_ROOT__', $distRoot)
Set-Content -LiteralPath $nginxConfig -Value $configText -Encoding ascii
$nginxPrefix = $nginxHome.Replace('\', '/') + '/'
& $nginxExe -p $nginxPrefix -c 'conf/local.conf' -t
if ($LASTEXITCODE -ne 0) { throw 'Nginx 配置检查失败' }

$nodeExe = (Get-Command node.exe).Source
$env:HOST = '127.0.0.1'
$env:PORT = "$apiPort"
$apiProcess = Start-Process -FilePath $nodeExe -ArgumentList 'dist-server/index.js' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localRoot 'api.out.log') -RedirectStandardError (Join-Path $localRoot 'api.err.log')
Set-Content -LiteralPath $apiPidFile -Value $apiProcess.Id
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$apiPort/healthz" -TimeoutSec 2
            if ($health.status -eq 'ok') { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 200 }
    }
    if (-not $ready) { throw 'BI API 未能启动，请查看 .local-deploy/api.err.log' }

    Start-Process -FilePath $nginxExe -ArgumentList '-p', $nginxPrefix, '-c', 'conf/local.conf' -WorkingDirectory $nginxHome -WindowStyle Hidden
    $siteReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $site = Invoke-WebRequest "http://127.0.0.1:$sitePort/" -TimeoutSec 2 -UseBasicParsing
            if ($site.StatusCode -eq 200) { $siteReady = $true; break }
        } catch { Start-Sleep -Milliseconds 200 }
    }
    if (-not $siteReady) { throw 'Nginx 未能启动，请查看 .local-deploy/nginx-*/logs/error.log' }
    Write-Host "本机部署已启动：http://127.0.0.1:$sitePort/"
    if ($Lan) {
        $lanAddresses = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.IPAddress -notlike '127.*' -and $_.InterfaceAlias -notlike 'VMware*' -and $_.InterfaceAlias -notlike 'Clash*'
        }
        foreach ($address in $lanAddresses) {
            Write-Host "同事访问：http://$($address.IPAddress):$sitePort/  （$($address.InterfaceAlias)）"
        }
    }
    Write-Host "停止命令：powershell -ExecutionPolicy Bypass -File deploy/local-windows.ps1 -Action stop"
} catch {
    Stop-LocalDeployment
    throw
}
