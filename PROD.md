# Production Build & Deployment

AICortex 分为两部分：**Server**（中心化服务）和 **Client**（Agent 执行节点）。

---

## Server（服务端）

服务端包含 Go Backend + Next.js Frontend + PostgreSQL。

### 快速启动

```bash
make db-up                              # 启动 PostgreSQL
cd server && go run ./cmd/migrate up    # 运行数据库迁移
make start                              # 启动 Backend + Frontend
```

### 构建

```bash
# Frontend
pnpm install && pnpm build

# Backend
cd server
go build -o bin/aicortex-server ./cmd/server
```

### 运行

```bash
# 方式 1: make
make start                    # 启动 (Backend :8080 + Frontend :3000)
make stop                     # 停止

# 方式 2: Docker 自建
make selfhost-build           # 从源码构建镜像 + 启动全栈
make selfhost-stop            # 停止

# 方式 3: 手动
cd server && ./bin/aicortex-server          # Backend
cd apps/web && node .next/standalone/server.js   # Frontend
```

### 环境变量 (.env)

```env
DATABASE_URL=postgres://aicortex:aicortex@localhost:5432/aicortex?sslmode=disable
PORT=8080
FRONTEND_PORT=3000
JWT_SECRET=<random-32-chars>
ENCRYPTION_KEY=<random-32-chars>
```

### 数据库

```bash
make db-up                    # 启动 PostgreSQL 容器
make db-down                  # 停止
make db-reset                 # 重置（删库 + 重建 + 迁移）
cd server && go run ./cmd/migrate up    # 仅运行迁移
```

### 健康检查

```bash
curl http://localhost:8080/api/health    # Backend
curl http://localhost:3000               # Frontend
```

---

## Client（客户端 / Agent 执行节点）

Client 是 Daemon 进程，运行在有 AI CLI 的机器上（开发者笔记本、CI Runner、云 VM）。它连接 Server，领取任务，调用 Agent CLI 执行。

### 构建

```bash
cd server
go build -o bin/aicortex ./cmd/aicortex
```

### 首次配置

```bash
# 连接 AICortex Cloud（默认）
aicortex setup

# 连接自建 Server
aicortex setup self-host --server-url http://your-server:8080

# 或通过环境变量
export AICORTEX_SERVER_URL=http://your-server:8080
aicortex setup self-host

# 或通过 config 命令
aicortex config set server_url http://your-server:8080
```

### 运行

```bash
# 后台模式
aicortex daemon start

# 前台模式（适合 systemd / supervisor）
aicortex daemon start --foreground

# 查看状态
aicortex daemon status
```

### 健康检查

```bash
curl http://localhost:19514/health
```

### 前提条件

Client 机器上需要安装至少一个 Agent CLI：
- `kiro-cli`
- `claude` (Claude Code)
- `codex`
- `copilot`
- 其他支持的 CLI

Daemon 启动时自动检测 PATH 上的可用 CLI。

---

## 常用命令汇总

| 命令 | 说明 | 角色 |
|------|------|------|
| `make dev` | 一键开发环境 | Server |
| `make build` | 构建前后端 | Server |
| `make start` / `make stop` | 启动/停止服务 | Server |
| `make db-up` / `make db-down` | 启动/停止数据库 | Server |
| `make selfhost-build` | Docker 自建部署 | Server |
| `aicortex setup` | 首次配置 | Client |
| `aicortex daemon start` | 启动 Daemon | Client |
| `aicortex daemon status` | 查看 Daemon 状态 | Client |

---

## 升级

### Server

```bash
git pull
pnpm install && pnpm build
cd server && go build -o bin/aicortex-server ./cmd/server
cd server && go run ./cmd/migrate up
make stop && make start
```

### Client

```bash
cd server && go build -o bin/aicortex ./cmd/aicortex
aicortex daemon start    # 自动重启
```
