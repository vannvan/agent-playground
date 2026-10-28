# LangChain Playground

集聊天、生图、自媒体文章生成、文章仿写、文章润色、知识库问答为一体的AI实验型项目，持续探索中...

基于 Node.js 的 Lerna monorepo 项目，整合了三方服务：**管理后台（admin-web）**、**主站（front-web）** 和 **后端 API（server）**，统一用 Lerna + npm workspaces 管理。

## 技术栈

| 包名 | 技术栈 | 说明 |
|------|--------|------|
| `admin-web` | React 19 + TypeScript + Vite + Less | 管理后台，含运营看板、用户管理、会话/图片/仿写数据、范式萃取、公告管理、管理员管理 |
| `front-web` | React 19 + TypeScript + Vite + Tailwind CSS + Less | 主站，含 AI 聊天、AI 生图、AI 仿写、稿件润色评审、知识库问答 |
| `server` | NestJS + MySQL | REST API，代理 /api/* 请求，支持 RAG、图片生成、仿写等 |

## 安装依赖

```bash
npm install
```

## 启动方式

### 全部同时启动

```bash
npm run dev
```

同时启动三个服务（web 直接请求后端，无需代理）：

- **server** — `http://localhost:3000`（后端 API，显式固定端口）
- **front-web** — `http://localhost:5173`（主站，`.env.development` 中 `VITE_API_BASE_URL=http://localhost:3000`）
- **admin-web** — `http://localhost:5174`（管理后台，同上）

### 单独启动

```bash
npm run dev:front       # 仅主站
npm run dev:admin       # 仅管理后台
npm run dev:server      # 仅后端
```

## 构建

```bash
npm run build           # 全部构建
npm run build:front     # 仅主站
npm run build:admin     # 仅管理后台
npm run build:server    # 仅后端
```

## 代码检查

```bash
npm run lint            # 全部 lint
npm run lint:front      # 仅主站
npm run lint:admin      # 仅管理后台
npm run lint:server     # 仅后端
npm run test            # 后端单元测试
```

## 数据库配置

在 `server/.env` 中配置 MySQL 连接信息后，后端会自动建表：

```bash
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=chat_app
MYSQL_PASSWORD=change-me
MYSQL_DATABASE=langchain_chat
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-long-unique-password
```

首次启动且管理员表为空时，服务端使用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 创建初始管理员（密码至少 14 位）；之后可在管理后台 `/admins` 添加和维护管理员帐号。

访问 `http://localhost:5174` 进入管理后台（需先登录）。管理员登录使用 HttpOnly Cookie；生产环境请启用 HTTPS 并限制 `FRONTEND_ORIGIN`。

## 管理后台功能

- **运营看板**（`/overview`）— 系统统计概览
- **用户管理**（`/users`）— 用户列表与状态管理
- **会话数据**（`/sessions`）— 聊天记录查看
- **图片数据**（`/images`）— 生成图片管理
- **仿写数据**（`/rewrites`）— 仿写文章记录
- **范式萃取**（`/paradigm`）— 文章风格分析
- **公告管理**（`/announcements`）— 系统公告发布与时间控制
- **管理员管理**（`/admins`）— 管理账号维护

已发布且在生效时间范围内的公告会显示在主站工作区；可关闭公告的关闭状态按用户单独保存，前台每分钟刷新一次公告列表。

## 模型配置

用户登录后在主站设置中填写自己的 API Key、OpenAI 兼容 Base URL，以及文本、图像和视频模型名称；可先运行文本模型连通性测试再保存配置。API Key 使用 AES-256-GCM 加密存储，部署前必须配置 `MODEL_CONFIG_ENCRYPTION_KEY`。

## 知识库 RAG

RAG 通过认证后的 `/api/rag` 端点和主站 `/rag` 路由提供。上传的 PDF、Markdown、TXT 文档按用户索引存储在 `.rag-data/<userId>/index.json`（可通过 `RAG_DATA_DIR` 修改路径）。批量上传限制：单次最多 100 个文件，单文件 15 MB，总计 60 MB。嵌入向量使用阿里云百炼 OpenAI 兼容接口，需配置 `ALIYUN_ACCESS_KEY`、`ALIYUN_ACCESS_BASE_URL`、`ALIYUN_EMBEDDING_MODEL`。
