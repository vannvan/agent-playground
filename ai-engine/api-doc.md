# Python AI Engine API 文档

> 基础地址：`http://localhost:8000`
> 交互式文档：`http://localhost:8000/docs`

---

## 1. GET /

返回服务基本信息与可用端点列表。

**请求**

无需请求体。

**响应示例**

```json
{
  "service": "Python AI Engine",
  "version": "0.1.0",
  "docs": "/docs",
  "endpoints": [
    "GET  /health",
    "GET  /tools",
    "POST /chat/stream",
    "POST /chat/sync",
    "POST /ingest",
    "GET  /sessions/{id}"
  ]
}
```

---

## 2. GET /health

健康检查接口，返回当前模型配置、工具清单和服务状态。

**请求**

无需请求体。

**响应字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 固定值 `"ok"` |
| model | string | 当前使用的 LLM 模型名 |
| tool_count | int | 已注册工具数量 |
| tools | string[] | 工具名称列表 |

**响应示例**

```json
{
  "status": "ok",
  "model": "agnes-2.5-flash",
  "tool_count": 1,
  "tools": ["search_knowledge_base"]
}
```

---

## 3. GET /tools

返回所有已注册工具的详细信息。

**请求**

无需请求体。

**响应字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| tools | string[] | 工具名称列表 |

**响应示例**

```json
{
  "tools": ["search_knowledge_base"]
}
```

---

## 4. POST /chat/stream

**核心接口**：流式对话，SSE（Server-Sent Events）逐 token 输出。

**Content-Type**: `application/json`

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 用户消息，最少 1 个字符 |
| session_id | string\|null | 否 | 会话 ID；不传则服务端自动创建 |

**请求示例**

```json
{
  "message": "什么是 LangChain？",
  "session_id": null
}
```

**SSE 事件协议**

服务端以 `text/event-stream` 格式逐行推送事件，每行格式为：

```
data: <JSON>
```

| type | 含义 | 字段 |
|------|------|------|
| `text` | LLM 输出增量文本 | `content`：当前 token 片段 |
| `tool` | Agent 触发工具调用 | `name`：工具名，`args`：调用参数 JSON 字符串 |
| `sources` | 检索来源（工具调用后返回） | `sources`：数组，每项含 `content`、`source`、`score` |
| `done` | 对话结束 | `session_id` |
| `error` | 发生错误 | `message` |

**SSE 输出示例**

```
data: {"type":"text","content":""}
data: {"type":"tool","name":"search_knowledge_base","args":"{\"query\":\"LangChain\",\"top_k\":4}"}
data: {"type":"sources","sources":[{"content":"LangChain 是...","source":"data/xxx.md","score":0.85}]}
data: {"type":"text","content":"LangChain"}
data: {"type":"text","content":"是"}
data: {"type":"text","content":"一个"}
data: {"type":"text","content":"开源"}
...
data: {"type":"done","session_id":"abc123"}
```

**curl 示例**

```bash
curl -N -X POST http://localhost:8000/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"介绍一下这个项目"}'
```

---

## 5. POST /chat/sync

非流式对话接口，等待完整回复后一次性返回结果。适用于调试。

**Content-Type**: `application/json`

**请求体**（同 `/chat/stream`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 用户消息 |
| session_id | string\|null | 否 | 会话 ID |

**响应字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| session_id | string | 本次对话的会话 ID |
| reply | string | LLM 完整回复文本 |
| sources | array | 检索来源列表，每项含 `content`、`source`、`score` |

**请求示例**

```bash
curl -X POST http://localhost:8000/chat/sync \
  -H "Content-Type: application/json" \
  -d '{"message":"什么是 LangChain？"}'
```

**响应示例**

```json
{
  "session_id": "a1b2c3d4e5f6",
  "reply": "LangChain 是一个用于构建基于大语言模型应用的开源框架...",
  "sources": [
    {
      "content": "LangChain 是...",
      "source": "data/✍️重点知识点梳理.md",
      "score": 0.8732
    }
  ]
}
```

---

## 6. POST /ingest

触发文档入库，扫描 `data/` 目录下的文件，加载、切分、写入向量库。支持增量去重——仅处理新增或变更的文件。

**Content-Type**: `application/json`

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| source_dir | string\|null | 否 | 文档目录路径；缺省使用配置项 `DATA_DIR`（默认 `data/`） |

**响应字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| documents_added | int | 新增/更新的 chunk 数量 |
| files_processed | int | 本次处理的新增文件数 |
| skipped | int | 跳过的已入库文件数 |

**请求示例**

```bash
curl -X POST http://localhost:8000/ingest \
  -H "Content-Type: application/json" \
  -d '{"source_dir": null}'
```

**支持的文档格式**

- `.md` — Markdown（UTF-8）
- `.txt` — 纯文本（UTF-8）
- `.pdf` — PDF 文档
- `.docx` — Word 文档

---

## 7. GET /sessions/{session_id}

读取指定会话的历史消息记录。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| session_id | string | 会话 ID（从 `/chat/stream` 或 `/chat/sync` 响应中获取） |

**响应字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| session_id | string | 会话 ID |
| messages | array | 消息列表，按时间顺序 |
| created_at | string | 会话创建时间（ISO 8601） |

**messages 条目结构**

| 字段 | 类型 | 说明 |
|------|------|------|
| role | string | `"user"` 或 `"assistant"` |
| content | string | 消息内容 |
| ts | string | 发送时间（ISO 8601） |

**请求示例**

```bash
curl http://localhost:8000/sessions/a1b2c3d4e5f6
```

**响应示例**

```json
{
  "session_id": "a1b2c3d4e5f6",
  "messages": [
    {"role": "user", "content": "什么是 LangChain？", "ts": "2026-10-28T15:00:00"},
    {"role": "assistant", "content": "LangChain 是一个...", "ts": "2026-10-28T15:00:05"}
  ],
  "created_at": "2026-10-28T15:00:00"
}
```

**错误响应**

会话不存在时返回 404：

```json
{
  "detail": "会话不存在"
}
```

---

## SSE 事件完整协议速查

```
data: {"type":"text","content":"<增量 token>"}   ← LLM 生成的文字片段
data: {"type":"tool","name":"<工具名>","args":"<JSON>"}  ← Agent 调用工具
data: {"type":"sources","sources":[...]}         ← 检索来源（工具返回后附带）
data: {"type":"done","session_id":"<id>"}        ← 对话结束标志
data: {"type":"error","message":"<错误信息>"}    ← 异常时触发
```

调用方收到 `done` 或 `error` 事件后即完成本次请求。

---

## 配置说明

在 `ai-engine/.env` 文件中配置以下变量（参考 `.env.example`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AI_MODEL` | `gpt-4o-mini` | LLM 模型名 |
| `AI_BASE_URL` | （空） | OpenAI 兼容接口地址，国产模型需填写 |
| `AI_API_KEY` | （空） | API 密钥 |
| `AI_SYSTEM_PROMPT` | 内置默认 | Agent 系统提示词 |
| `AI_RECURSION_LIMIT` | `8` | Agent 最大递归深度，防止死循环 |
| `DATA_DIR` | `data` | 知识库源文件目录 |
| `DB_DIR` | `vector_db` | Chroma 向量库持久化目录 |
| `SESSION_TTL` | `3600` | 会话过期秒数 |

---

## 启动命令

```bash
# 安装依赖
pip3 install -r requirements.txt

# 启动服务（开发模式）
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 启动服务（生产模式）
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```
