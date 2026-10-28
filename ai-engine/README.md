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

```bash
# 安装依赖
pip3 install -r requirements.txt

# 复制并编辑配置
cp .env.example .env
# 填写 AI_API_KEY 和 AI_BASE_URL（国产模型或自建模型）

# 入库文档（将文件放入 data/ 目录）
python3 ingest.py

# 启动服务
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
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
├── main.py          # FastAPI 入口 + 路由
├── config.py        # 配置加载（环境变量 + .env）
├── schemas.py       # Pydantic 请求/响应模型
├── agent.py         # LangGraph 编排
├── tools.py         # 工具注册表
├── retriever.py     # 向量检索（Chroma）
├── ingest.py        # 文档加载/切分/入库
├── memory.py        # 会话与记忆（内存版）
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
