# Linux 部署练习手册（Ubuntu Server + Nginx）

本文记录技术支持看板在 Ubuntu Server 24.04 上的手动部署流程。内容先用于 VMware 本机练习；真实服务器部署时，目录、账号、域名、网络和密钥管理方式需按运维要求调整。

## 1. 部署结构

```text
浏览器
  └─ HTTP → Nginx :80（静态文件和反向代理）
               ├─ 页面、JS、CSS → /opt/degson-dashboard/dist
               └─ /api/bi/* → Node API 127.0.0.1:3000
                                  └─ BI 服务 http://10.10.10.205
```

Nginx 的 `listen 80` 决定网页监听端口；`proxy_pass http://127.0.0.1:3000` 是 Nginx 到同机 Node API 的内部转发。Node API 负责从 BI 分享页读取签名密钥并签名调用 BI，所以浏览器不直接携带 BI 密钥。

## 2. VMware 本机练习准备

1. 建立 Ubuntu Server 24.04 虚拟机，练习时使用 NAT 网络即可。
2. 安装时记录 Linux 用户名和密码。登录使用 `Username`，不是服务器主机名；输入密码时终端不会显示字符。
3. VMware 共享文件夹设置为启用，并共享 Windows 项目目录，例如 `D:\company-project`。
4. Ubuntu 中共享目录通常挂载在 `/mnt/hgfs/`。检查：

   ```bash
   ls /mnt/hgfs
   ls /mnt/hgfs/company-project
   ```

5. 如果 Windows 启用 WSL 或虚拟机平台会引发启动故障，不要反复启停 Windows 功能；VMware 虚拟机和 WSL 是不同的运行方式。本练习不需要 Docker。

## 3. 更新 Ubuntu 并安装软件

在 Ubuntu 终端执行：

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install nginx curl -y
```

检查 Nginx：

```bash
sudo systemctl status nginx --no-pager
```

确认 `Active: active (running)`。Nginx 安装后通常会自动启动并设为开机启动。

安装 Node.js 22。本次练习使用 NodeSource DEB 软件源：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
ls -lh /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install nodejs -y
node -v
npm -v
```

本次演练验证版本为 Node.js `v22.23.4`、npm `10.9.9`。NodeSource 安装脚本会配置 APT 软件源；执行前应确认 URL 来自 NodeSource 官方渠道。

## 4. 在 Windows 构建项目

在 Windows PowerShell 的项目目录执行：

```powershell
cd D:\company-project
npm ci
npm run build
```

构建会生成：

- `dist/`：Nginx 托管的前端静态文件。
- `dist-server/`：Node API 的运行文件。

构建体积警告不一定代表失败；以命令退出码和是否生成以上目录为准。不要把 `node_modules/` 整个传到生产服务器；本项目 API 运行时使用 Node 内置模块。

## 5. 把构建文件放进 Ubuntu

本机练习通过 VMware 共享文件夹；真实 Linux 服务器可以从 Windows 用 SSH/SCP 传输，或使用公司 CI/CD 制品发布。

Ubuntu 中先确认共享目录内容：

```bash
ls /mnt/hgfs/company-project
```

复制前端和 API 构建目录：

```bash
sudo mkdir -p /opt/degson-dashboard
sudo cp -r /mnt/hgfs/company-project/dist /opt/degson-dashboard/
sudo cp -r /mnt/hgfs/company-project/dist-server /opt/degson-dashboard/
sudo chown -R "$USER":"$USER" /opt/degson-dashboard
ls -la /opt/degson-dashboard
```

如果 `cp` 报 `/opt/... Permission denied`，表示复制命令少了 `sudo`。检查两个目录都存在后再继续。

## 6. 配置 Nginx 站点

创建站点文件：

```bash
sudo nano /etc/nginx/sites-available/degson-dashboard
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name _;

    root /opt/degson-dashboard/dist;
    index index.html;

    location /api/bi/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
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

重要：`proxy_pass` 必须是 `http://127.0.0.1:3000;`，包括两个斜线；`try_files` 行末有分号；大括号必须配对。`listen 80` 让 Nginx 在虚拟机网络接口上监听 80 端口，而 `proxy_pass` 的 `127.0.0.1` 保持 API 只在本机使用。

保存 nano：按 `Ctrl+O`，按 Enter 确认文件名，再按 `Ctrl+X` 退出。nano 底部若显示 `Search [Backwards]:`，按 `Ctrl+C` 取消搜索后再继续。若提示目标目录不存在，先退出 nano，再用 `sudo mkdir -p` 创建目录。

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/degson-dashboard /etc/nginx/sites-enabled/degson-dashboard
```

如果提示 `File exists`，说明链接已经存在。Ubuntu 默认站点也占用 80 且可能与 `server_name _` 冲突时，可移除默认站点启用链接：

```bash
sudo rm /etc/nginx/sites-enabled/default
```

检查并应用配置：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

只有 `nginx -t` 成功后才 reload。确认 Nginx 监听：

```bash
sudo ss -ltnp | grep ':80'
```

预期看到 `0.0.0.0:80` 或 `*:80`。如果浏览器打开首页但 API 返回 502，通常是 Node API 没启动或没监听 3000。

## 7. 配置 BI API 环境变量

先创建系统配置目录和环境文件：

```bash
sudo mkdir -p /etc/degson-dashboard
sudo nano /etc/degson-dashboard/bi.env
```

写入：

```ini
HOST=127.0.0.1
PORT=3000
BI_BASE_URL=http://10.10.10.205
BI_SHARE_PAGE_URL=http://10.10.10.205/jeecg-boot/drag/share/view/1272000000000001003
```

按 `Ctrl+O`、Enter、`Ctrl+X` 保存退出。设置权限：

```bash
sudo chmod 600 /etc/degson-dashboard/bi.env
```

本项目不设置 `BI_SIGNATURE_SECRET` 时，会尝试从 BI 分享页读取签名密钥。如果分享页不可访问或不含密钥，再由管理员安全地配置 `BI_SIGNATURE_SECRET`。不要把密钥写进前端、Git、公开文档或 Nginx 网站目录。

确认 Linux 主机能访问 BI 网络。端口连通只是网络检查，不能证明签名或接口参数一定成功：

```bash
curl -I --max-time 10 http://10.10.10.205/jeecg-boot/drag/share/view/1272000000000001003
```

在真实部署中需由运维确认服务器路由/VPN/防火墙允许访问 `10.10.10.205:80`。

## 8. 创建 systemd 后台服务

先确认运行账号和 Node 路径：

```bash
whoami
command -v node
```

本次练习账号是 `yangkun`，Node 路径是 `/usr/bin/node`。创建服务文件：

```bash
sudo nano /etc/systemd/system/degson-bi.service
```

写入（如实际用户名或 Node 路径不同，替换对应值）：

```ini
[Unit]
Description=DEGSON dashboard BI API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=yangkun
WorkingDirectory=/opt/degson-dashboard
Environment=NODE_ENV=production
EnvironmentFile=/etc/degson-dashboard/bi.env
ExecStart=/usr/bin/node /opt/degson-dashboard/dist-server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

注意：`EnvironmentFile` 是 `/etc/degson-dashboard/bi.env`；`ExecStart` 是 `/usr/bin/node`（不是 `/user/bin/node`）。保存退出后加载并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now degson-bi
sudo systemctl status degson-bi --no-pager
```

确认 `Active: active (running)`。如先前用前台命令运行过 Node API，先回到那个终端按 `Ctrl+C` 停止临时进程，否则 systemd 会因 3000 端口已被占用而启动失败。

查看服务日志：

```bash
sudo journalctl -u degson-bi -n 100 --no-pager
sudo journalctl -u degson-bi -f
```

## 9. 验证部署

先验证 API 进程监听：

```bash
sudo ss -ltnp | grep ':3000'
```

Node API 应只监听 `127.0.0.1:3000`。再通过 Nginx 请求产品线接口：

```bash
curl -i http://127.0.0.1/api/bi/products
```

预期 `HTTP/1.1 200 OK` 且 JSON 中有数据。然后在 Windows 宿主机浏览器访问虚拟机地址：

```text
http://<Ubuntu虚拟机IP>/
```

查询当前虚拟机 IP：

```bash
hostname -I
```

VMware NAT 地址有可能在重启后改变；使用新 IP。NAT 下 Windows 宿主机可以访问不代表同事可访问。真实服务器要通过公司 DNS/IP、网络 ACL、防火墙和 HTTPS 配置供同事访问。

## 10. 常见故障

### 页面可见，API 返回 502

先检查 Node API 是否运行：

```bash
sudo ss -ltnp | grep ':3000'
sudo systemctl status degson-bi --no-pager
sudo journalctl -u degson-bi -n 100 --no-pager
```

没有 3000 监听时检查 systemd 状态、`bi.env` 路径、`ExecStart` 路径、运行用户权限及端口占用。

### 页面访问超时

确认使用 `hostname -I` 当前显示的 IP，而不是旧 IP；确认 Nginx 监听 `0.0.0.0:80`，并确认 VMware 网络模式和 Windows 防火墙。

### `sudo nginx -t` 报 `invalid URL prefix`

检查 `proxy_pass` 必须写成 `http://127.0.0.1:3000;`。不要把 Markdown 链接格式或中文标点粘贴进配置。

### nano 报目录不存在或无法写入

先退出 nano，再创建目录。例如：

```bash
sudo mkdir -p /etc/degson-dashboard
```

然后重新打开目标文件。`/opt`、`/etc` 等系统目录通常需要 `sudo`。

### BI 请求返回 502 JSON

这是 Node API 已接到请求但上游 BI 调用失败。查看服务日志，并检查服务器到 BI 分享页/API 的网络访问及签名配置。`/healthz` 正常只证明 Node 进程启动，不证明 BI 接口成功。

## 11. 更新发布

在 Windows 项目目录重新构建：

```powershell
npm ci
npm run build
```

把新的 `dist` 和 `dist-server` 复制到 Ubuntu 共享目录后，先备份旧构建，再复制新构建。示例（在 Ubuntu 执行）：

```bash
cd /opt/degson-dashboard
sudo cp -a dist "dist.bak.$(date +%Y%m%d%H%M%S)"
sudo cp -a dist-server "dist-server.bak.$(date +%Y%m%d%H%M%S)"
sudo cp -r /mnt/hgfs/company-project/dist /opt/degson-dashboard/
sudo cp -r /mnt/hgfs/company-project/dist-server /opt/degson-dashboard/
sudo chown -R yangkun:yangkun /opt/degson-dashboard
sudo systemctl restart degson-bi
sudo systemctl status degson-bi --no-pager
sudo nginx -t && sudo systemctl reload nginx
```

若发布失败，可根据备份目录恢复上个版本后重启 API。真实服务器更新建议采用带版本号的发布目录和原子切换，避免覆盖过程中用户拿到不完整文件。

## 12. 常用运维命令

```bash
sudo systemctl status nginx --no-pager
sudo systemctl status degson-bi --no-pager
sudo systemctl restart degson-bi
sudo systemctl reload nginx
sudo journalctl -u degson-bi -f
sudo nginx -t
```

本次部署配置模板也可参考：[`nginx.conf.example`](nginx.conf.example)、[`bi.env.example`](bi.env.example)、[`degson-bi.service.example`](degson-bi.service.example)。
