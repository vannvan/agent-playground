---
name: server-project-spec
description: 规定 NestJS/TypeScript 服务端的模块、目录边界、依赖注入与测试组织；新增或重构 server 的 API、业务模块、共享基础设施时使用。
---

# NestJS 项目目录规范

## 1. 适用范围

- 为 `server` 新增或调整 Controller、Service、Module、DTO、Repository、Guard、Interceptor 和测试时遵守。
- 按业务能力组织 feature module；只有跨模块复用的基础设施才进入公共目录。
- 不要求把现有源码一次性重排；新增代码遵循规范，旧代码按功能触及时渐进迁移。

## 2. 推荐结构

沿用 NestJS 的 feature-module 组织方式。模块目录直接放在 `src/` 下，与当前 `auth/`、`rag/`、`rewrite/`、`skills/` 等布局兼容：

```text
server/
├── src/
│   ├── main.ts                  # bootstrap、全局管道/过滤器、CORS
│   ├── app.module.ts            # 应用组合根
│   ├── app.controller.ts        # 仅健康检查或真正的应用级端点
│   ├── common/
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   └── pipes/
│   ├── config/                  # 集中配置与环境变量校验
│   ├── core/
│   │   ├── core.module.ts       # 跨 feature 的基础设施 providers
│   │   └── database/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── dto/
│   │   └── ...
│   ├── chat/
│   │   ├── chat.module.ts
│   │   ├── chat.controller.ts
│   │   ├── chat.service.ts
│   │   ├── dto/
│   │   └── ...
│   ├── rag/
│   ├── rewrite/
│   ├── skills/
│   └── ai-engine/
├── test/                        # e2e 测试
├── package.json
└── tsconfig.json
```

每个 feature 只创建实际需要的文件：

```text
feature-name/
├── feature-name.module.ts
├── feature-name.controller.ts
├── feature-name.service.ts
├── dto/
├── entities/                    # 使用 ORM/实体模型时
├── repositories/                # 有独立持久化职责时
└── feature-name.service.spec.ts
```

不要求每个模块都具备 `entities/` 或 `repositories/`。若项目使用统一的 `DatabaseService`，应按需抽取 feature repository，不要为了形式重复包装每个数据库方法。

## 3. 模块与职责边界

### 应用组合与共享基础设施

- `AppModule` 是组合根，只负责导入 feature modules 和应用级 providers，不承载业务流程。
- `main.ts` 负责应用启动、全局 ValidationPipe/Filter/Interceptor、CORS 和监听端口。
- `CoreModule` / `DatabaseModule` 只提供真正跨业务模块的基础设施；导出最小必要 provider。
- `common/` 仅放跨模块的装饰器、过滤器、守卫、拦截器和管道，禁止放某一业务专属逻辑。
- 配置集中管理并校验必需环境变量。业务代码不应散落读取 `process.env`；密钥不得进入源码或日志。

### Feature Module

- 一个业务能力对应一个 Nest module，负责声明该能力的 controllers、providers 和 imports/exports。
- Controller 负责 HTTP 参数、DTO、认证/授权和响应协议；业务规则交给 Service。
- Service 负责业务用例编排，通过构造函数依赖注入使用其他 provider。
- Repository 负责持久化细节；外部 HTTP、Python AI Engine 等调用可封装为 client/adapter service。
- Feature Module 只导出被其他模块确实需要的 provider；避免模块间直接访问彼此私有实现。
- 禁止反向依赖 `AppModule`。出现循环依赖时先重新划分职责或抽取端口/公共模块，不以 `forwardRef()` 作为默认解法。

### DTO、验证与错误

- 输入和输出契约放在所属 feature 的 `dto/`；DTO 类使用明确类型并避免复用数据库实体作为请求模型。
- 新增接口应通过全局 `ValidationPipe` 和 DTO 校验约束输入；若项目尚未配置相应验证依赖，先遵循现有校验模式，不要直接假定依赖已安装。
- 使用 Nest 内置 HTTP 异常表达可预期的客户端错误；未知异常继续抛出并由统一错误处理记录。
- 不捕获异常后返回空对象、默认成功或吞掉错误；日志应包含请求/业务上下文，但不能输出 token、密码等敏感值。

### SSE 与长连接

- Controller 负责设置 SSE 响应头、逐事件写出并处理响应结束；生成和业务编排由 Service/下游 client 完成。
- 不要缓存完整答案后再一次性发送。上游流应逐块转发，必要时设置禁用代理缓冲的响应头。
- 客户端断开时应停止上游读取并清理任务/reader；异常应转换成明确的错误事件，且只结束一次响应。
- 为事件格式、顺序、错误和断连编写测试。

## 4. 命名与依赖规则

- 目录和文件名使用 `kebab-case`，如 `knowledge-base/knowledge-base.service.ts`。
- 类名使用 `PascalCase`，并按职责命名：`ChatModule`、`ChatController`、`ChatService`。
- Nest 文件后缀保持统一：`.module.ts`、`.controller.ts`、`.service.ts`、`.guard.ts`、`.dto.ts`、`.spec.ts`。
- 优先使用显式构造函数注入；不要在业务方法中手动 `new` 其他业务 Service。
- Providers 默认使用 singleton scope；只有确有请求隔离需求时才使用 request scope。
- 避免巨大 `AppController`、巨大 service、通用 `helpers.ts` 和无边界的 `utils/`。

## 5. 测试规范

- 单元测试与被测类放在 feature 目录附近，命名为 `*.spec.ts`，使用 Nest Testing utilities mock 外部依赖。
- HTTP 端到端测试放在 `server/test/`，覆盖路由、验证、认证和响应契约。
- 数据库、Python AI Engine、网络请求等外部依赖应可替换或 mock；单元测试不依赖真实密钥和个人本地服务。
- 新增业务行为至少覆盖成功路径、输入错误和外部依赖失败路径。
- 新代码应通过 `npm test`、`npm run build`；相关 lint 规则按仓库脚本执行。

## 6. 本仓库渐进迁移约定

- 现有 `auth/`、`rag/`、`rewrite/`、`skills/`、`ai-engine/` 已采用 feature-first 布局，继续沿用，不再额外套一层 `modules/`。
- `CoreModule` 用于共享服务；数据库职责可在后续调整中归入 `core/database/` 或独立 `DatabaseModule`，不应为文档规范而立即搬迁。
- 当前根级 `AppController` 承担多个业务接口。新增业务接口优先放入对应 feature Controller；旧接口在修改或拆分时逐步迁移，并保持路由和响应兼容。
- `skills/` 下的单个技能应保持自包含；注册、公共协议和依赖注入由 `SkillsModule` 管理，技能实现不直接耦合其他 feature 的内部类。
