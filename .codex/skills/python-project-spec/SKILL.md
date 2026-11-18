---
name: python-project-spec
description: 规定 Python/FastAPI 后端的目录结构、分层边界和测试组织；新增或重构 ai-engine 的路由、服务、Agent、检索与数据访问时使用。
---

# Python / FastAPI 项目目录规范

## 1. 适用范围

- 为 `ai-engine` 新增或调整 FastAPI 路由、请求模型、业务服务、Agent、工具、检索、入库和存储逻辑时遵守。
- 本规范约束应用源码；知识库原文、向量索引、运行日志等运行时数据不属于 Python 包。
- 小型功能不要求机械地创建所有目录；只有出现对应职责时才创建模块。

## 2. 推荐结构

按业务能力组织模块，并在模块内区分 HTTP、业务和基础设施职责：

```text
ai-engine/
├── app/
│   ├── __init__.py
│   ├── main.py                 # 创建 FastAPI app、注册 lifespan 和总路由
│   ├── api/
│   │   ├── router.py           # 汇总 API 路由
│   │   ├── deps.py             # HTTP 层依赖注入
│   │   └── routes/
│   │       ├── health.py
│   │       ├── chat.py
│   │       └── knowledge_base.py
│   ├── core/
│   │   ├── config.py           # Settings 与配置读取
│   │   ├── logging.py
│   │   └── exceptions.py       # 应用级异常与处理器
│   ├── chat/
│   │   ├── schemas.py           # Chat API 输入/输出模型
│   │   ├── service.py           # 对话用例编排
│   │   ├── agent.py             # LangGraph 图、节点和状态
│   │   ├── tools.py             # Agent 工具注册与适配
│   │   └── query_rewriter.py
│   ├── knowledge_base/
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── retriever.py
│   │   ├── ingest.py            # 可复用的入库业务逻辑
│   │   └── repository.py        # Chroma 等存储适配
│   └── sessions/
│       ├── service.py
│       └── repository.py
├── scripts/
│   └── ingest.py                # 本地手动执行的 CLI 入口
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── conftest.py
│   └── ...
├── data/                        # 知识库源文件，运行时数据
├── vector_db/                   # 向量索引，运行时数据
├── requirements.txt
└── .env.example
```

允许按当前规模合并相邻文件，但不允许因此混淆职责。测试、数据目录和部署入口应保持在应用包之外。

## 3. 分层职责

### API 路由层

- 负责 HTTP 路径、状态码、请求/响应模型、认证依赖和协议适配。
- 使用 `APIRouter` 按资源或能力拆分，并由总路由统一挂载。
- 调用 service 完成用例；不直接执行向量检索、模型调用、文件处理或复杂业务编排。
- SSE 路由只负责将异步事件转换为 SSE 帧；取消请求时应取消下游任务并释放资源。

### Service / 业务层

- 表达可复用的业务用例，例如对话流程、知识库入库和查询。
- 组织 Agent、repository、外部客户端之间的调用；不依赖 `Request`、`Response` 等 HTTP 对象。
- 通过明确的输入输出类型返回结果；错误不能被捕获后静默转换为成功响应。

### Agent、Repository 与外部适配层

- LangGraph 图、状态、节点及工具按 Agent/业务能力归组，不放进 FastAPI 路由。
- Chroma、文件系统、会话存储和第三方模型客户端通过 repository 或 adapter 封装。
- 避免业务逻辑直接依赖具体存储 SDK；存储替换或测试时可注入替身。
- 同步且可能阻塞的 I/O 不应直接阻塞 async 路由事件循环；使用异步客户端，或明确交给线程池执行。

### 配置、模型与生命周期

- 配置集中在 `core/config.py`，通过 Settings 统一读取；业务代码不得散落读取环境变量。
- 密钥只从环境变量或受控密钥管理系统读取，不写入源码和提交文件。
- 共享连接、模型客户端等有生命周期的资源由 FastAPI `lifespan` 创建和关闭，不在每个请求中重复初始化。
- 外部依赖超时、重试和失败行为应显式配置；不要使用静默默认值掩盖服务异常。

## 4. 命名与类型约定

- 包和模块使用 `snake_case`；类使用 `PascalCase`；函数、变量使用 `snake_case`。
- 请求/响应模型使用明确的 Pydantic 类型，按业务能力放置；不要把数据库对象或 LangChain 内部对象直接作为 API 契约。
- 当前服务声明支持 Python 3.9：对会被 FastAPI/Pydantic 解析的可选类型优先使用 `Optional[T]` / `Union`。升级 Python 最低版本时，应同步更新部署环境并验证 OpenAPI schema。
- 导入使用明确的包路径，避免循环导入和通配符导入。

## 5. 测试规范

- 新测试放在 `tests/`，按 `unit/`、`integration/` 或 `api/` 区分；目录结构尽量对应 `app/`。
- 单元测试隔离模型、向量库、文件系统和网络请求；不依赖真实 API 密钥。
- FastAPI 接口使用 `TestClient` 或异步客户端验证状态码、响应模型和错误路径。
- 流式接口至少覆盖首个文本块及时到达、事件顺序、断连清理和异常事件。
- 新增测试应可由统一测试命令运行；不要把只依赖个人本地数据的脚本当作回归测试。


## 6. 必须避免

- 将所有 endpoint、业务流程和基础设施继续堆入单个 `main.py`。
- 在路由中直接创建模型、数据库或向量库客户端。
- 为了目录完整而创建空层、无意义的 `utils.py` 或万能 `common.py`。
- 捕获宽泛异常后返回空结果、默认答案或伪成功状态。
- 把测试、密钥、向量索引或用户数据提交到源码目录。
