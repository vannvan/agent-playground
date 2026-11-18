# Python AI Engine

单机桌面客户端的 AI 能力引擎，通过 HTTP 对外提供 AI 编排与执行能力。

## 技术栈

- Python 3.9+
- FastAPI（HTTP + SSE 流式）
- LangGraph（Agent 编排状态机）
- LangChain 生态
- ChromaDB（本地向量库）
- HuggingFace Transformers（本地 embedding 模型）

## 快速开始

以下命令均在 `ai-engine/` 目录下执行。

```bash
# 安装依赖
pip3 install -r requirements.txt

# 复制并编辑配置
cp .env.example .env
# 填写 AI_API_KEY 和 AI_BASE_URL（国产模型或自建模型）
# AI_ENGINE_SOURCE_TOKEN 需与 server/.env 中的值保持一致

# 入库文档（将文件放入 data/ 目录）
python3 -m scripts.ingest

# 启动服务
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 服务信息 |
| GET | `/health` | 健康检查 |
| GET | `/tools` | 可用工具清单 |
| POST | `/chat/stream` | 流式对话（SSE） |
| POST | `/chat/sync` | 非流式对话（调试用） |
| POST | `/ingest` | 文档入库 |
| GET | `/sessions/{id}` | 读取会话历史 |

API 文档：`http://localhost:8000/docs`

## 目录结构

```
ai-engine/
├── app/
│   ├── main.py                  # FastAPI app factory 与 lifespan
│   ├── api/routes/              # 按资源拆分的 HTTP 路由
│   ├── core/config.py           # 配置加载（环境变量 + .env）
│   ├── chat/                    # LangGraph、工具、查询改写和对话 schema
│   ├── knowledge_base/          # 检索、归一化和入库逻辑
│   └── sessions/                # 会话记忆
├── scripts/                     # 本地手动执行的运维脚本
│   └── ingest.py
├── tests/
├── requirements.txt
├── .env.example
├── data/            # 知识库源文件
└── vector_db/       # Chroma 向量库
```

## 能力地图

| 能力 | 状态 |
|------|------|
| LangGraph Agent 编排 | ✅ |
| 工具注册表 | ✅ |
| 知识库检索（Chroma） | ✅ |
| 文档入库（增量） | ✅ |
| 会话记忆（内存） | ✅ |
| SSE 流式输出 | ✅ |
| Redis 长期记忆 | ⏸ |
| 评测埋点 | ⏸ |

`scripts/ingest.py` 是本地手动工具脚本，不属于 HTTP 路由；从 `ai-engine/` 目录运行 `python3 -m scripts.ingest`。
