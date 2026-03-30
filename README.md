# Assetflow

面向 DeFi 与个人加密资产的本地仪表板：多链持仓聚合、手动资产录入、快照与周/月度 P&L。

设计说明见 [design/DESIGN.md](design/DESIGN.md)。

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
make db-pull      # 从生产服务器同步数据库到本地（见下方说明）
```

---

## 5.1 从生产服务器同步数据库

数据库文件（`server/data/assetflow.db`）不进 git，本地开发时如需与生产数据对齐，执行：

```bash
make db-pull
```

- 默认 SSH 别名为 `xw`，无需停止服务器进程，使用 SQLite 在线热备份保证数据一致性。
- 如需指定其他 SSH 别名：`make db-pull REMOTE=yourhost`
- 拉取完成后直接覆盖本地 `server/data/assetflow.db`，重启本地开发服务器即生效。

> 注意：此操作为单向同步（服务器 → 本地），不会影响服务器数据，也不涉及 git。

---

## 6. 数据与目录

- SQLite 数据库：`server/data/assetflow.db`
- 前端生产静态资源目录：`client/`
- 后端编译产物：`server/dist/`

---

## 7. 常见问题（Ubuntu）

| 问题 | 处理方式 |
|------|----------|
| `better-sqlite3` 安装失败 | 确认已安装 `build-essential`，并使用 Node 22 |
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
