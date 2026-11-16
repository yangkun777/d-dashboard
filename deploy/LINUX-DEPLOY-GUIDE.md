# Linux 部署手册（Ubuntu + Nginx）

本文记录本项目在 Ubuntu Linux 服务器上的手动部署流程，包括在 Windows 构建、上传文件、配置 Node API、配置 Nginx、验证和更新。VMware Ubuntu 练习与真实服务器流程相同；区别是练习用共享文件夹传文件，真实服务器一般用 SSH/SCP 或公司发布平台。

> 真实服务器的 Linux 用户、域名、SSH 端口、Nginx 目录、访问策略由运维确认。不要覆盖服务器已有站点配置。本文的 BI 地址是公司内网地址，服务器必须能访问 BI 网络。

## 快速部署（推荐真实服务器使用）

项目提供 `deploy/deploy-linux.sh`，可在已安装 Node.js 22、Nginx、curl、systemd 的 Ubuntu/Debian 服务器上自动部署。它会创建服务账号、版本发布目录、BI 环境文件（仅首次）、systemd 服务和 Nginx 站点，执行配置检查、启停服务和 API 健康检查。已有 BI 环境文件会保留；其他 Nginx 站点不会被脚本删除。

先在 Windows PowerShell 项目根目录打包并上传三个项目：

```powershell
npm ci
npm run build
ssh -p 22 <登录用户>@<服务器地址> "mkdir -p ~/dashboard-upload"
scp -P 22 -r .\dist .\dist-server .\deploy\deploy-linux.sh <登录用户>@<服务器地址>:~/dashboard-upload/
```

登录服务器后，使用实际域名或服务器 IP 执行一次部署：

```bash
sudo bash ~/dashboard-upload/deploy-linux.sh --source ~/dashboard-upload --server-name <域名或服务器IP>
```

脚本默认使用服务账号 `dashboard`、Node API 端口 `3000` 和本项目的 BI 地址。首次运行会在 `/etc/degson-dashboard/bi.env` 创建权限为 `600` 的环境文件；后续更新保留该文件。若环境文件已有 `BI_SIGNATURE_SECRET`，脚本不会覆盖它。

执行前确认域名/IP、端口和现有 Nginx 站点安排符合运维规范。脚本会备份同名站点、服务和 BI 环境文件到 `/var/backups/degson-dashboard/`。完成时会显示发布目录和备份目录。要检查问题可运行 `sudo systemctl status degson-bi --no-pager` 和 `sudo journalctl -u degson-bi -n 50 --no-pager`。

以下章节记录逐步手动部署方式，适合学习每个环节；重复部署时可使用上述脚本。
## 1. 部署结构

```text
浏览器
  └─ HTTP/HTTPS → Nginx :80/:443
                    ├─ 网页文件 → /opt/degson-dashboard/dist
                    └─ /api/bi/* → Node API 127.0.0.1:3000
                                       └─ 公司 BI 10.10.10.205
```

Nginx 对外提供网页和 `/api/bi/` 反向代理；Node API 只监听服务器本机 `127.0.0.1:3000`，由它签名请求 BI。BI 密钥不发到浏览器。

## 2. 服务器首次准备（只需做一次）

先登录 Linux 服务器，并确认系统版本、账号和权限：

```bash
whoami
cat /etc/os-release
```

安装 Nginx、curl 和 Node.js 22 或兼容更新版本。Ubuntu/Debian 可使用 apt 安装 Nginx 和 curl：

```bash
sudo apt update
sudo apt install nginx curl -y
```

Node.js 的安装方式应按公司软件源规范执行。检查：

```bash
node -v
command -v node
nginx -v
```

项目 API 使用 Node 内置模块，服务器运行不需要上传 `node_modules/`。

检查服务器能访问 BI 分享页：

```bash
curl -I --max-time 10 http://10.10.10.205/jeecg-boot/drag/share/view/1272000000000001003
```

预期收到 HTTP 响应。若连接失败，由运维确认内网路由、VPN、代理和防火墙；本地电脑能访问不代表服务器也能访问。

## 3. 在 Windows 构建发布文件

在 Window22s PowerShell 进入项目目录并构建：

```powershell
cd D:\company-project
npm ci
npm run build
```

构建成功后会生成：

- `dist/`：网页静态文件。
- `dist-server/`：Node API 运行文件。

先确认它们存在：

```powershell
Get-Item .\dist\index.html, .\dist-server\index.js
```

## 4. 把文件上传到真实 Linux 服务器

先向运维获取 SSH 用户名、服务器 IP/域名和 SSH 端口。Windows 10/11 通常自带 `ssh` 和 `scp`。在项目目录执行下面命令，把占位符替换成实际信息：

```powershell
ssh -p 22 <登录用户>@<服务器地址> "mkdir -p ~/dashboard-upload"
scp -P 22 -r .\dist .\dist-server <登录用户>@<服务器地址>:~/dashboard-upload/
```

`ssh` 远程创建接收目录；`scp` 通过 SSH 安全复制两个构建目录。SSH 端口不是 22 时，把两处 `22` 换成运维提供的端口。首次连接出现主机指纹提示时，先核对服务器地址，再按公司要求确认。若公司使用 SSH 私钥，按运维给的私钥参数连接，例如 `-i C:\Users\admin\.ssh\company_key`。

检查上传结果：

```powershell
ssh -p 22 <登录用户>@<服务器地址> "ls -l ~/dashboard-upload"
```

应能看到 `dist` 和 `dist-server`。VMware 练习时这一步可用共享目录代替：

```bash
ls -l /mnt/hgfs/company-project/dist /mnt/hgfs/company-project/dist-server
```

## 5. 安装文件并设置服务账号

真实服务器上使用专用、不可交互登录的服务账号。先创建账号（已有账号时跳过）：

```bash
sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin dashboard
```

`useradd` 创建 Linux 用户；`--system` 表示服务账号；`--user-group` 创建同名组；`--no-create-home` 不创建个人目录。

创建应用目录并复制上传的构建文件：

```bash
sudo mkdir -p /opt/degson-dashboard
sudo cp -a ~/dashboard-upload/dist /opt/degson-dashboard/
sudo cp -a ~/dashboard-upload/dist-server /opt/degson-dashboard/
sudo chown -R dashboard:dashboard /opt/degson-dashboard
sudo chmod -R u=rwX,go=rX /opt/degson-dashboard
ls -ld /opt/degson-dashboard /opt/degson-dashboard/dist /opt/degson-dashboard/dist-server
```

`/opt` 通常用于安装应用；`chown` 把文件交给服务账号；`chmod` 允许服务账号读取/执行文件，并让 Nginx 可读取静态网页。VMware 共享文件夹练习时，将来源路径改为 `/mnt/hgfs/company-project/dist` 和 `/mnt/hgfs/company-project/dist-server`。

## 6. 配置 BI 环境文件

在系统配置目录创建 API 环境文件：

```bash
sudo install -d -o root -g root -m 755 /etc/degson-dashboard
sudo nano /etc/degson-dashboard/bi.env
```

输入以下内容：

```ini
HOST=127.0.0.1
PORT=3000
BI_BASE_URL=http://10.10.10.205
BI_SHARE_PAGE_URL=http://10.10.10.205/jeecg-boot/drag/share/view/1272000000000001003
```

nano 保存：按 `Ctrl+O`、按 `Enter` 确认、再按 `Ctrl+X` 退出。然后限制文件权限并检查：

```bash
sudo chown root:root /etc/degson-dashboard/bi.env
sudo chmod 600 /etc/degson-dashboard/bi.env
sudo ls -l /etc/degson-dashboard/bi.env
```

权限应为 `-rw-------`。默认情况下 API 会从 BI 分享页读取签名密钥。如果分享页无法提供密钥，再由 BI 管理员安全地提供密钥，并在此文件添加 `BI_SIGNATURE_SECRET=实际密钥`。不要把密钥写入前端代码、Git、普通部署包或 Nginx 网站目录。

## 7. 配置 Node API 的 systemd 服务

先确认 Node 路径：

```bash
command -v node
```

假设输出为 `/usr/bin/node`。如果路径不同，下面 `ExecStart` 使用实际结果。创建服务配置：

```bash
sudo nano /etc/systemd/system/degson-bi.service
```

写入：

```ini
[Unit]
Description=DEGSON dashboard BI API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=dashboard
Group=dashboard
WorkingDirectory=/opt/degson-dashboard
Environment=NODE_ENV=production
EnvironmentFile=/etc/degson-dashboard/bi.env
ExecStart=/usr/bin/node /opt/degson-dashboard/dist-server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

`User`/`Group` 必须与服务账号一致；`EnvironmentFile` 指向上一步创建的配置；`ExecStart` 的路径要按 `command -v node` 核对。保存后让 systemd 读取并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now degson-bi
sudo systemctl status degson-bi --no-pager
```

状态应为 `Active: active (running)`。检查 API 健康接口：

```bash
curl -i http://127.0.0.1:3000/healthz
```

预期返回 `HTTP/1.1 200 OK` 和 `{"status":"ok"}`。

## 8. 配置 Nginx

先确认 Nginx 使用哪种站点目录：

```bash
ls -ld /etc/nginx/sites-available /etc/nginx/conf.d
```

Ubuntu 常见方式是 `sites-available/sites-enabled`。若目录存在，创建：

```bash
sudo nano /etc/nginx/sites-available/degson-dashboard
```

如果服务器用 `/etc/nginx/conf.d/`，则创建 `/etc/nginx/conf.d/degson-dashboard.conf`。写入以下内容，并把 `server_name` 换成实际域名或服务器 IP：

```nginx
server {
    listen 80;
    server_name dashboard.example.internal;

    root /opt/degson-dashboard/dist;
    index index.html;

    location /api/bi/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    location /assets/ {
        try_files $uri =404;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`listen 80` 是网页对外 HTTP 端口；`proxy_pass` 的 `127.0.0.1:3000` 是同一台服务器上的 Node API。若使用 Ubuntu `sites-available`，启用站点前检查链接不存在：

```bash
sudo ln -s /etc/nginx/sites-available/degson-dashboard /etc/nginx/sites-enabled/degson-dashboard
```

不要为了消除冲突直接删除默认站点或其他站点。若 `nginx -t` 显示多个默认站点或端口冲突，让运维确认应如何整合。检查并应用：

```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx
```

只有 `nginx -t` 显示语法正确且测试成功后才 reload。

## 9. 验证网页和数据接口

在 Linux 服务器执行：

```bash
curl -I http://127.0.0.1/
curl -i http://127.0.0.1/api/bi/products
sudo ss -ltnp | grep -E ':80|:3000'
```

网页和产品线接口预期返回 HTTP 200；Node API 应只监听 `127.0.0.1:3000`，Nginx 应监听服务器的 80 端口。`/healthz` 正常只说明 Node API 进程运行；BI 数据接口 502 时还要检查 BI 网络和签名。

在 Windows 浏览器用 `http://<服务器域名或IP>/` 访问。真实上线需由运维配置 HTTPS、DNS、防火墙、访问控制；同一 Nginx 已承载其他网站时必须与现有配置协调。

## 10. 更新发布

Windows 重新构建并上传新的 `dist`、`dist-server`。服务器上先备份当前目录，再覆盖并重启 API：

```bash
cd /opt/degson-dashboard
sudo cp -a dist "dist.bak.$(date +%Y%m%d%H%M%S)"
sudo cp -a dist-server "dist-server.bak.$(date +%Y%m%d%H%M%S)"
sudo cp -a ~/dashboard-upload/dist /opt/degson-dashboard/
sudo cp -a ~/dashboard-upload/dist-server /opt/degson-dashboard/
sudo chown -R dashboard:dashboard /opt/degson-dashboard
sudo chmod -R u=rwX,go=rX /opt/degson-dashboard
sudo systemctl restart degson-bi
sudo systemctl status degson-bi --no-pager
sudo nginx -t && sudo systemctl reload nginx
```

真实生产发布建议使用带版本号的目录并原子切换，避免覆盖文件时用户访问到不完整版本。环境文件和密钥不需要随前端构建重新上传。

## 11. 故障排查

### 页面打开但 API 是 502

```bash
sudo systemctl status degson-bi --no-pager
sudo journalctl -u degson-bi -n 100 --no-pager
sudo ss -ltnp | grep ':3000'
curl -i http://127.0.0.1:3000/healthz
```

检查 Node 服务是否 active、3000 端口是否监听、BI 地址和分享页是否可达。`/healthz` 成功不代表 BI 上游成功。

### systemd 显示服务失败

```bash
sudo systemctl cat degson-bi
sudo journalctl -u degson-bi -n 100 --no-pager
command -v node
ls -l /opt/degson-dashboard/dist-server/index.js /etc/degson-dashboard/bi.env
```

核对 `ExecStart`、运行账号、构建文件路径和环境文件路径。改过 service 后必须执行 `sudo systemctl daemon-reload` 再重启。

### Nginx 配置检查失败

```bash
sudo nginx -t
```

按报错文件和行号检查分号、大括号、`proxy_pass http://127.0.0.1:3000;`。不要把 Markdown 格式或中文标点粘进配置。

### SSH/SCP 连接失败

确认服务器地址、用户名、SSH 端口、VPN/办公网络和公司指定的密钥/跳板机方式。若使用非 22 端口，`ssh` 用小写 `-p`，`scp` 用大写 `-P`。

## 12. 常用运维命令

```bash
sudo systemctl status nginx --no-pager
sudo systemctl status degson-bi --no-pager
sudo systemctl restart degson-bi
sudo systemctl reload nginx
sudo journalctl -u degson-bi -f
sudo nginx -t
```

配置模板：[`nginx.conf.example`](nginx.conf.example)、[`bi.env.example`](bi.env.example)、[`degson-bi.service.example`](degson-bi.service.example)。

