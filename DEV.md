1. 准备环境

  cp .env.example .env
  # 编辑 .env，设置：
  #   JWT_SECRET=<随机字符串>
  #   AICORTEX_DEV_VERIFICATION_CODE=888888  (本地测试用固定验证码)

  2. 编译

  pnpm install          # 安装前端依赖
  make build            # 编译 Go 二进制 → server/bin/
  pnpm build            # 编译前端生产包

  3. 启动数据库

  make db-up            # 启动 PostgreSQL 容器

  4. 运行迁移

  server/bin/migrate up

  5. 启动后端 (端口 8080)

  server/bin/server

  6. 启动前端 (端口 3000，新终端)

  cd apps/web && pnpm start

  7. 注册用户 + 创建工作区

  打开 http://localhost:3000，输入邮箱，验证码用 (http://localhost:3000，输入邮箱，验证码用) 888888（.env
  中设置的），创建一个工作区。

  8. 配置并启动 Agent CLI Daemon (新终端)

  # 一键配置：指向本地后端、打开浏览器登录、启动 daemon
  server/bin/aicortex setup self-host

  这会自动：

  1. 配置 CLI 连接 localhost:8080 / localhost:3000
  2. 打开浏览器认证（用同一个邮箱 + 888888）
  3. 发现你的工作区
  4. 启动 daemon 后台运行

  9. 验证 daemon 状态

  server/bin/aicortex daemon status

  应该能看到检测到的 AI agent CLI（如 claude、codex 等，取决于你 PATH 里装了哪些）。

  10. 在 Web 端注册 Agent

  进入 http://localhost:3000 (http://localhost:3000) → 设置 → Agents → 新建 Agent，选择你的 Runtime 和
  Provider，创建后就可以给它分配任务了。