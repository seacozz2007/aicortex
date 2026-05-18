# Production Build & Deployment

AICortex 分为两部分：**Server**（Go 后端 + Next.js 前端 + PostgreSQL）和 **Client**（本机 Daemon + Agent CLI）。

本地改代码、调试用 [DEV.md](DEV.md)。本文说明 **开发模式与生产部署的区别**，以及云服务器 / 公网 IP 要注意的配置。

---

## 开发 vs 生产（先看这张表）

| | **开发** | **生产 / 正常对外部署** |
|---|----------|-------------------------|
| 典型命令 | `make setup` → `make start` 或 `make dev` | `make selfhost` / `make selfhost-build`，或 `pnpm build` + `pnpm start` |
| 前端 | `next dev`（Turbopack） | `next build` + `next start` |
| 后端 | `go run ./cmd/server` | `server/bin/server` 或 Docker 镜像 |
| 热更新 HMR | **有**（`/_next/webpack-hmr`） | **无** |
| 适用场景 | 本机或内网改代码 | 云服务器、公网域名、长期运行 |

> **常见误区**：`make start` 不是生产部署。它启动的是 **dev 模式**，用公网 IP 访问时 Console 可能出现 `webpack-hmr` WebSocket 报错，属正常现象（见下文 [公网 IP 访问](#公网-ip--云服务器)）。

### Make 命令对照

| 命令 | 作用 | 是否启动服务 |
|------|------|----------------|
| `make setup` | 安装依赖、确保 Postgres、跑迁移 | 否 |
| `make start` | 开发模式：迁移 + `go run` 后端 + `pnpm dev:web` | 是（dev） |
| `make dev` | 同 `scripts/dev.sh`，效果类似 `make start` | 是（dev） |
| `make stop` | 停止本机 8080 / 3000 进程 | — |
| `make build` | 编译 Go → `server/bin/`（不含前端 dev） | 否 |
| `make selfhost` | Docker 拉官方镜像并启动全栈 | 是（生产） |
| `make selfhost-build` | 从当前源码构建 Docker 镜像并启动 | 是（生产） |

`make start` 打印的 `Backend: http://localhost:8080` 只是**固定提示文案**，不表示 `.env` 里的 `FRONTEND_ORIGIN` 无效；对外仍可用 `http://<公网IP>:3000` 访问（需安全组放行 3000 / 8080）。

---

## Server：生产部署

### 方式 A — Docker（推荐，云服务器首选）

```bash
cp .env.example .env   # 编辑 JWT_SECRET、FRONTEND_ORIGIN、邮件等
make selfhost          # 拉 GHCR 镜像并启动
# 若镜像未发布：
make selfhost-build
```

> 国内用户构建时 npm 下载慢，在 `.env` 里加上 registry 镜像（一劳永逸）：
>
> ```env
> NPM_REGISTRY_MIRROR=https://registry.npmmirror.com
> ```
>
> 也可单次传参：`NPM_REGISTRY_MIRROR=https://registry.npmmirror.com make selfhost-build`

停止：`make selfhost-stop`

### 方式 B — 本机构建后运行（裸机）

```bash
make db-up
cp .env.example .env   # 按需编辑

pnpm install
make build             # Go → server/bin/server、migrate、aicortex
pnpm build             # 前端生产包 → apps/web/.next

server/bin/migrate up
server/bin/server &    # 后端 :8080

cd apps/web && pnpm start   # 前端生产模式 :3000（不是 next dev）
```

停止进程：`make stop`（不关闭 Docker 里的 Postgres）。

### 生产环境变量（`.env` 要点）

```env
DATABASE_URL=postgres://aicortex:aicortex@localhost:5432/aicortex?sslmode=disable
PORT=8080
FRONTEND_PORT=3000
JWT_SECRET=<随机字符串，务必修改>

# 对外访问的完整 URL（不要用 localhost）
FRONTEND_ORIGIN=http://<你的公网IP或域名>:3000
CORS_ALLOWED_ORIGINS=http://<你的公网IP或域名>:3000
ALLOWED_ORIGINS=http://<你的公网IP或域名>:3000

# 浏览器直连后端 WebSocket（实时功能；dev 用公网 IP 时尤其需要）
NEXT_PUBLIC_WS_URL=ws://<你的公网IP或域名>:8080/ws

# 上传文件外链（勿写 localhost）
LOCAL_UPLOAD_BASE_URL=http://<你的公网IP或域名>:8080

# CLI / Daemon（在 Agent 机器上配置，可与 Server 同机）
AICORTEX_APP_URL=http://<你的公网IP或域名>:3000
AICORTEX_SERVER_URL=ws://<你的公网IP或域名>:8080/ws
```

生产环境 **不要** 设置 `AICORTEX_DEV_VERIFICATION_CODE`（固定验证码仅用于私有本地开发）。

更多变量见 [SELF_HOSTING.md](SELF_HOSTING.md)、[SELF_HOSTING_ADVANCED.md](SELF_HOSTING_ADVANCED.md)。

### 公网 IP / 云服务器

1. **不要用 `make start` 对外提供服务** — 用上一节的 Docker 或 `pnpm build` + `pnpm start`。
2. 安全组放行 **3000**（Web）、**8080**（API / WebSocket）。
3. 若坚持用 `make start`（仅临时调试）：
   - `.env` 设置 `FRONTEND_ORIGIN` 与 `CORS_ALLOWED_ORIGINS` 为公网 URL；
   - 修改后必须 `make stop` 再 `make start`；
   - Console 里 `/_next/webpack-hmr` 失败一般**不影响登录**，可忽略。
4. 登录页「继续」灰色：多为浏览器自动填充未触发 React 状态，请**手输邮箱**再点。

### 健康检查

```bash
curl http://localhost:8080/health              # 后端（公网同理换 IP）
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login   # 前端
curl http://localhost:3000/api/config          # 经前端代理的后端配置
```

### 数据库

```bash
make db-up
make db-down
make db-reset                 # 删库重建 + 迁移
server/bin/migrate up         # 仅迁移（生产常用）
```

---

## Server：开发模式（简要）

仅在本机或内网改代码时使用；细节见 [DEV.md](DEV.md)。

```bash
make setup      # 一次性：依赖 + DB + 迁移
make start      # 或 make dev
```

- 前端：`next dev`，有 HMR。
- 后端：`go run ./cmd/server`。
- 可选：`AICORTEX_DEV_VERIFICATION_CODE=888888` + `APP_ENV=development`（仅私有环境）。

---

## Client（Agent 执行节点）

Daemon 跑在装有 Agent CLI 的机器上，连接已部署的 Server。

### 构建 CLI

```bash
make build    # → server/bin/aicortex
```

### 首次配置（自建 Server，一行示例）

```bash
server/bin/aicortex setup self-host --server-url http://<Server地址>:8080 --app-url http://<Server地址>:3000
```

提示 `Current configuration: localhost...` 是**旧配置预览**，输入 `y` 后才会写入新地址。`--server-url` / `--app-url` **必须带端口**。

CLI 与浏览器不在同一台机器时，在本机 CLI 上加：`--callback-host localhost`（或本机局域网 IP）。

### 运行

```bash
server/bin/aicortex daemon start
server/bin/aicortex daemon status
```

### Daemon 健康检查

```bash
curl http://localhost:19514/health
```

机器上需至少安装一种 Agent CLI（`claude`、`codex`、`copilot` 等，在 `PATH` 中）。

---

## 常用命令汇总

| 命令 | 模式 | 说明 |
|------|------|------|
| `make setup` | — | 准备环境，不启动 |
| `make start` / `make dev` | 开发 | `next dev` + `go run`，有 HMR |
| `make build` | 构建 | 编译 Go 二进制 |
| `pnpm build` + `apps/web` 下 `pnpm start` | 生产 | 裸机前端 |
| `make selfhost` / `make selfhost-build` | 生产 | Docker 全栈 |
| `make stop` | — | 停本机 8080/3000 进程 |
| `server/bin/aicortex setup self-host` | Client | 配置并登录 CLI |

---

## 升级

### Server（生产，Docker）

```bash
git pull
# 若用 selfhost：改 .env 中 AICORTEX_IMAGE_TAG 或重新 make selfhost
docker compose -f docker-compose.selfhost.yml pull
docker compose -f docker-compose.selfhost.yml up -d
```

### Server（生产，裸机）

```bash
git pull
pnpm install && pnpm build
make build
server/bin/migrate up
make stop
server/bin/server &
cd apps/web && pnpm start
```

### Server（开发）

```bash
git pull
pnpm install
make stop && make start
```

### Client

```bash
make build
server/bin/aicortex daemon start
```



# Daemon 1: 连接默认 server（用 ~/.aicortex/config.json）
  aicortex daemon start

  # Daemon 2: 连接另一个 server（用 ~/.aicortex/profiles/prod/config.json）
  aicortex daemon start --profile prod

  设置步骤：

  # 1. 为第二个 server 创建 profile
  aicortex setup self-host --profile prod
  # 会提示输入 server URL，配置保存到 ~/.aicortex/profiles/prod/config.json

  # 2. 登录
  aicortex login --profile prod

  # 3. 启动
  aicortex daemon start --profile prod

  每个 profile 有独立的：

  - 配置文件：~/.aicortex/profiles/<name>/config.json
  - Daemon ID：~/.aicortex/profiles/<name>/daemon.id（推测）
  - 工作区目录：~/aicortex_workspaces_<name>/

  两个 daemon 进程互不干扰，可以同时运行。