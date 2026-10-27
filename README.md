# LangChain + SSE minimal demo

一个 Node.js LangChain + SSE 流式对话最小 Demo：React 19 + TypeScript + Tailwind CSS + Less 前端，NestJS 后端。

## Run

```bash
npm run dev
```

这条命令会同时启动：

- 前端 Vite：`http://localhost:5173`
- 后端 NestJS：`http://localhost:3000`

也可以单独启动：`npm run dev --prefix frontend` 或 `npm run start:dev --prefix backend`。

打开 http://localhost:5173。

## 会话数据与管理后台

配置 `backend/.env` 中的 MySQL 连接信息后，后端会保存会话、用户问题、助手回答和请求状态。首次启动会自动创建数据表，也可以手动执行 `backend/sql/schema.sql`。

```bash
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=chat_app
MYSQL_PASSWORD=change-me
MYSQL_DATABASE=langchain_chat
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-long-unique-password
```

首次启动且管理员表为空时，服务端使用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 创建初始管理员（密码至少 14 位）；之后可在 `/admin` 添加和维护管理员帐号。访问 `http://localhost:5173/admin` 可管理用户、聊天会话和运营看板。管理员登录使用 HttpOnly Cookie；生产环境请启用 HTTPS 并限制 `FRONTEND_ORIGIN`。

管理后台新增「系统公告」模块，可设置通知类型、发布开关、开始/结束时间以及用户是否可关闭。已发布且在生效时间范围内的公告会显示在用户工作区；可关闭公告的关闭状态按用户单独保存，前台每分钟刷新一次公告列表。

模型配置不使用服务端共享的模型 ID 或 API Key。用户登录后在工作区设置中填写自己的 API Key、OpenAI 兼容 Base URL，以及文本、图像和视频模型名称；可以先运行文本模型连通性测试，再保存配置。测试会向文本模型发送最小请求，可能产生少量费用。API Key 使用 AES-256-GCM 加密后保存在服务端，部署前必须配置 `MODEL_CONFIG_ENCRYPTION_KEY`。视频模型名称目前仅保存为配置项，尚未接入视频生成接口。

前端请求 `POST /api/chat`，通过 Vite proxy 转发到 NestJS。SSE 事件格式为 `data: {"content":"..."}`，结束事件为 `event: done`。

注意：之前的 API key 曾直接出现在源码中，请立即在中转站后台撤销并重新生成，不要提交真实 `.env` 文件。
