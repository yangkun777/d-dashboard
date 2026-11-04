# DEGSON 技术支持看板

基于 Vue 3、TypeScript、Element Plus 和 ECharts 的浅色大屏看板原型。

## 页面

- 运营总览：工单指标、流量、事项分布、产品线与紧急程度
- 业务排行：国内 / 国际工单数和工时四组横向排行
- 个人效能：处理工时、工单数量和人员明细
- 工单明细：日期、办理人、状态、分类、关键词筛选，分页、循环滚动演示和 Excel 导出
- 产品线事项：六个事业部的事项占比

顶部“全屏”按钮会进入大屏展示并隐藏侧边栏和顶部栏；鼠标移到右上角时显示退出叉号，也可按 Esc 退出。

五个页面均已联调 BI 接口。业务排行展示国内、国际的工单数与工时四组真实排行；国际排行图内可滚动查看全部人员。

## 运行

```bash
npm install
npm run dev
```

访问终端提示的本地地址。生产构建使用 `npm run build`，同时生成前端 `dist/` 和独立 API 服务 `dist-server/`。

## BI 数据联调

开发和 `vite preview` 时，项目内的服务端桥接 `/api/bi/overview` 会并行请求运营总览的 12 个 BI 数据集，`/api/bi/ranking` 请求国内工单、国内工时、国际工单、国际工时数据集（0013、0014、0026、0027），`/api/bi/efficiency` 请求个人效能两张图和表格对应的 3 个数据集（0015、0016、0017），`/api/bi/orders` 将日期、办理人、事项状态、事项分类和关键词传给工单明细数据集（0018），`/api/bi/products` 请求产品线事项的 6 个数据集（0019–0024）。这些页面每 10 分钟刷新一次，并显示最近成功更新时间；失败时显示错误和重试按钮。工单明细的数据集未返回总数，页面对当前筛选结果进行分页和导出。

桥接会从 BI 分享页读取 `signatureSecret`，按同事提供的 MD5 规则为每次请求生成 `X-Sign`、`V-Sign` 和当前毫秒时间戳。地址变化时可复制 `.env.example` 为 `.env.local` 调整 `BI_BASE_URL` 或 `BI_SHARE_PAGE_URL`；也可在服务端设置 `BI_SIGNATURE_SECRET`，避免运行时读取分享页。`.env.local` 已被 Git 忽略，密钥和签名都不会打包进浏览器代码。

生产环境由项目自带的 Node API 服务负责签名和请求 BI。浏览器只访问同源的 `/api/bi/*`，不会拿到密钥。

## Windows 本机部署演练

本机演练不需要 Docker、WSL 或管理员权限。在项目目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\local-windows.ps1 -Action start
```

脚本会运行生产构建，将官方 Nginx/Windows 下载到 Git 忽略的 `.local-deploy/`，然后在本机启动 Node API（`127.0.0.1:3001`）和 Nginx（`127.0.0.1:8080`）。访问 `http://127.0.0.1:8080/` 检查页面；这里使用的是构建后的 `dist/`，与开发地址 `5173` 无关。

结束演练时运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\local-windows.ps1 -Action stop
```

供同事通过局域网访问时，启动命令增加 `-Lan`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\local-windows.ps1 -Action start -Lan
```

Nginx 在 `8080` 端口提供构建后的 `dist/`，并同源代理 BI 接口；Node API 仍仅绑定本机 `127.0.0.1:3001`。首次需在管理员 PowerShell 运行 `deploy/allow-lan-windows.ps1`（默认网卡名称为“以太网”），只允许指定网卡、同网段访问本项目 Nginx 的 TCP 8080。网卡名称不同时通过 `-InterfaceAlias` 指定。

2026-11-02 本机访问地址为 `http://192.168.24.146:8080/`。IP 变化后以 Windows 以太网实际 IPv4 地址为准，不使用 VMware 虚拟网卡地址。电脑需要保持开机和服务运行；重启后重新运行启动命令。更新版本前先停止部署，再启动，避免占用端口。

再次演练前先运行 `stop`，再运行 `start`。Windows 版 Nginx 仅用于本机熟悉流程；正式服务器仍推荐 Linux 版 Nginx。

## 生产部署建议（Linux + Nginx）

以下命令假设服务器已安装 Node.js 22 或更新的兼容版本、Nginx，登录账号有 `sudo` 权限，并且服务器能访问 `10.10.10.205`。先在服务器运行 `node -v`、`command -v node`、`nginx -v` 检查安装情况；用 `curl -sS -o /dev/null -w '%{http_code}\n' http://10.10.10.205/jeecg-boot/drag/share/view/1272000000000001003` 检查分享页，预期返回 `200`。安装软件的命令因 Linux 发行版而异，可让服务器管理员提供。

### 1. 构建和上传

在自己的电脑上打开项目目录，运行 `npm ci` 和 `npm run build`。构建成功后会生成 `dist/`（网页）和 `dist-server/`（Node API）。下面用 `<登录用户>` 和 `<服务器IP>` 作为占位符，替换为实际 SSH 信息：

```powershell
ssh <登录用户>@<服务器IP> "mkdir -p ~/degson-dashboard-upload"
scp -r .\dist .\dist-server .\deploy <登录用户>@<服务器IP>:~/degson-dashboard-upload/
```

登录服务器后，把文件放到正式目录：

```bash
sudo mkdir -p /opt/degson-dashboard /etc/degson-dashboard
sudo cp -a ~/degson-dashboard-upload/dist ~/degson-dashboard-upload/dist-server /opt/degson-dashboard/
sudo chmod -R a+rX /opt/degson-dashboard
```

服务器运行时不需要 `node_modules/`：当前 API 只使用 Node 内置模块。

### 2. 创建 `/etc/degson-dashboard/bi.env`

这个文件给 Node API 提供运行参数。用下面的命令在服务器上创建，当前 BI 地址可直接照抄：

```bash
sudo tee /etc/degson-dashboard/bi.env > /dev/null <<'EOF'
HOST=127.0.0.1
PORT=3000
BI_BASE_URL=http://10.10.10.205
BI_SHARE_PAGE_URL=http://10.10.10.205/jeecg-boot/drag/share/view/1272000000000001003
EOF
sudo chmod 600 /etc/degson-dashboard/bi.env
```

`HOST=127.0.0.1` 表示 API 只接受服务器本机的连接；公网访问由 Nginx 转发。`PORT=3000` 是 Node API 监听的端口。`BI_BASE_URL` 是 BI 服务主地址，不要写到具体接口路径。`BI_SHARE_PAGE_URL` 用来读取签名信息，使用已联调的 `1003` 分享页即可，其他页面的数据集也能使用同一签名。目前**不用填写 `BI_SIGNATURE_SECRET`**。只有分享页无法读取、但数据接口仍可访问时，才请同事或运维提供正确密钥，并按公司的密钥管理方式设置 `BI_SIGNATURE_SECRET`；不要把密钥放进网页目录或提交到代码库。示例文件见 [`deploy/bi.env.example`](deploy/bi.env.example)。

### 3. 启动 Node API

示例服务文件 [`deploy/degson-bi.service.example`](deploy/degson-bi.service.example) 中的 `User=degson` 是服务账号。先请管理员确认是否已有这个账号；没有时可运行 `sudo useradd --system --home-dir /opt/degson-dashboard --shell /usr/sbin/nologin degson` 创建。Node.js 最好安装在系统级目录，供服务账号读取。运行 `command -v node`，如果输出不是 `/usr/bin/node`，把服务文件中的 `ExecStart=` 改成实际 Node 路径。然后执行：

```bash
sudo cp ~/degson-dashboard-upload/deploy/degson-bi.service.example /etc/systemd/system/degson-bi.service
sudo nano /etc/systemd/system/degson-bi.service
sudo systemctl daemon-reload
sudo systemctl enable --now degson-bi
sudo systemctl status degson-bi --no-pager
curl http://127.0.0.1:3000/healthz
```

最后一条预期输出 `{"status":"ok"}`。如果服务没有起来，运行 `sudo journalctl -u degson-bi -n 50 --no-pager` 查看错误。再运行 `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/bi/overview`，预期返回 `200`；如果返回 `502`，优先检查服务器能否访问 BI 分享页和数据接口。

### 4. 配置 Nginx

参考 [`deploy/nginx.conf.example`](deploy/nginx.conf.example)，示例使用 `/etc/nginx/conf.d/`；先确认服务器的 `/etc/nginx/nginx.conf` 包含这个目录。把 `server_name dashboard.example.internal` 改为实际内网域名或服务器 IP。如果同一台 Nginx 已经在 80 端口运行其他网站，应由管理员调整站点配置，避免冲突。

```bash
sudo cp ~/degson-dashboard-upload/deploy/nginx.conf.example /etc/nginx/conf.d/degson-dashboard.conf
sudo nano /etc/nginx/conf.d/degson-dashboard.conf
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
curl -I http://127.0.0.1/
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1/api/bi/overview
```

最后两条应返回 `200`。随后通过实际域名或服务器 IP 打开页面，逐页检查图表。正式提供给其他人访问前，应由管理员配置 HTTPS、访问控制和所需防火墙规则。不要把 `vite preview` 当作生产 Web 服务。

当前五个页面均使用真实 BI 数据。上线前请逐页核对看板口径和访问权限。
