# Assetflow

面向 DeFi 与个人加密资产的本地仪表板：多链持仓聚合、手动资产录入、快照与周/月度 P&L。

设计说明见 [docs/DESIGN.md](docs/DESIGN.md)。

运行约定：

- `client/` 是前端构建产物目录，不是源码目录；源码以根目录 `src/` 和 `dist/` 为准。
- 写操作接口现在要求管理员登录后返回的 token；访客模式继续保留只读访问。

---

## 1. Ubuntu 本地部署（推荐）

以下流程适用于 Ubuntu 22.04 / 24.04，目标是让项目在本机常驻运行（`http://<服务器IP>:3001`）。

### 1.1 安装系统依赖

```bash
sudo apt update
sudo apt install -y curl git build-essential make
```

### 1.2 安装 Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 1.3 拉取项目并安装依赖

```bash
git clone <你的仓库地址> assetflow
cd assetflow
make install
```

### 1.4 生产构建并启动

```bash
make build
make start
```

如果你使用仓库内置脚本（`start.sh` / `stop.sh`）来管理进程，推荐这样跑：

```bash
# 首次或代码更新后（确保 server/dist 和 client 已更新）
make build

# 启动（后台运行，日志写入 logs/assetflow.log）
./start.sh

# 查看运行日志
tail -f logs/assetflow.log

# 停止
./stop.sh

# 一键重启
./stop.sh; ./start.sh
```

脚本行为说明：

- `start.sh`：检测 `assetflow.pid`，避免重复启动；启动后写入 PID。
- `stop.sh`：按 PID 停止进程；若 PID 失效会自动清理 `assetflow.pid`。

默认监听端口 `3001`，访问：

- 本机：`http://localhost:3001`
- 局域网：`http://<你的服务器IP>:3001`

---

## 2. Ubuntu 常驻运行（systemd）

推荐使用 `systemd` 托管进程，支持自动拉起和开机自启。

### 2.1 创建服务文件

```bash
sudo tee /etc/systemd/system/assetflow.service >/dev/null <<'EOF'
[Unit]
Description=Assetflow Local Dashboard
After=network.target

[Service]
Type=simple
User=<你的Linux用户名>
WorkingDirectory=/home/<你的Linux用户名>/assetflow
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
```

### 2.2 启用并启动

```bash
sudo systemctl daemon-reload
sudo systemctl enable assetflow
sudo systemctl start assetflow
sudo systemctl status assetflow
```

### 2.3 查看日志

```bash
journalctl -u assetflow -f
```

---

## 3. 更新发布（Ubuntu）

每次改代码后，按以下步骤更新：

```bash
cd /home/<你的Linux用户名>/assetflow
git pull
make install
make build
sudo systemctl restart assetflow
```

---

## 4. 开发模式（本地联调）

开发时前后端分别运行：

- API：`3001`
- 前端 Vite：`5173`（通过 `vite.config.ts` 代理 `/api` 到 `3001`）

```bash
# 终端 1
cd server && npm run dev

# 终端 2（项目根目录）
npm run dev
```

或使用：

```bash
make dev
```

---

## 5. 常用命令

```bash
make install      # 安装前后端依赖
make build        # 前端构建并复制到 client/，再构建后端
make start        # 生产启动（非 systemd）
make dev          # 前后端开发并行
make test         # 后端 Vitest
make lint         # 前端 ESLint
```

---

## 5.1 从生产服务器同步数据

数据文件（`server/data/*.json`）不进 git，本地开发时如需与生产数据对齐，执行：

```bash
rsync -avz xw:/root/cook/Assetflow/server/data/ server/data/
```

- 默认 SSH 别名为 `xw`，直接覆盖本地 `server/data/`，重启本地开发服务器即生效。
- 此操作为单向同步（服务器 → 本地），不影响服务器数据，也不涉及 git。

---

## 6. 数据与目录

数据以 JSON 文件形式存储在 `server/data/`，无需数据库引擎：

| 文件 | 用途 |
|------|------|
| `wallets.json` | 钱包地址列表 |
| `manual_assets.json` | 手动录入资产 |
| `weekly_pnl.json` | 周度 P&L 记录 |
| `monthly_pnl.json` | 月度 P&L 记录 |
| `income_baselines.json` | 收益基准线 |
| `revenue_overview.json` | 营收概览快照 |
| `settings.json` | 用户设置 |

- 前端生产静态资源目录：`client/`
- 后端编译产物：`server/dist/`

> 所有数据文件均不进 git，请自行备份 `server/data/` 目录。

---

## 7. 常见问题（Ubuntu）

| 问题 | 处理方式 |
|------|----------|
| 依赖安装失败 | 确认已安装 `build-essential`，并使用 Node 22 |
| 页面还是旧静态资源 | 重新执行 `make build`，确认 `client/` 已更新，再重启服务 |
| 端口无法访问 | 检查 `systemctl status assetflow`、防火墙（`ufw`）和端口监听 |
| 访问 3001 空白/404 | 确认 `client/index.html` 存在；未执行构建时会缺失 |
| 服务反复重启 | `journalctl -u assetflow -n 200 --no-pager` 查看具体错误 |

---

## 8. 可选：Docker 部署

```bash
docker compose up -d --build
docker compose logs -f
```

停止：

```bash
docker compose down
```
