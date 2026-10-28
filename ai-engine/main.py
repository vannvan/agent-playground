"""main.py — FastAPI 入口（薄，只做 HTTP 分发）"""
from __future__ import annotations
from typing import Optional

import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from config import get_settings
from schemas import (
    ChatReq, IngestReq, HealthResp, ToolsResp,
    SyncChatResp, IngestResp, SessionResp,
)
from agent import run_chat_stream
from tools import get_tool_names, TOOLS
from retriever import collection_count
from memory import create_session, get_session_history

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 50)
    logger.info("Python AI Engine 启动")
    logger.info("模型：%s  |  BaseURL：%s", get_settings().ai_model, get_settings().ai_base_url or "(default)")
    logger.info("向量库文档数：%d", collection_count())
    logger.info("可用工具：%s", get_tool_names())
    logger.info("=" * 50)
    yield
    logger.info("Python AI Engine 关闭")


app = FastAPI(
    title="Python AI Engine",
    description="AI 能力引擎 — 只做 AI 编排与执行",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/", tags=["root"])
async def root():
    return {
        "service": "Python AI Engine",
        "version": "0.1.0",
        "docs": "/docs",
        "endpoints": [
            "GET  /health",
            "GET  /tools",
            "POST /chat/stream",
            "POST /chat/sync",
            "POST /ingest",
            "GET  /sessions/{id}",
        ],
    }


@app.get("/health", response_model=HealthResp, tags=["health"])
async def health():
    cfg = get_settings()
    return HealthResp(
        status="ok",
        model=cfg.ai_model,
        tool_count=len(TOOLS),
        tools=get_tool_names(),
    )


@app.get("/tools", response_model=ToolsResp, tags=["tools"])
async def list_tools():
    return ToolsResp(tools=get_tool_names())


@app.post("/chat/stream", tags=["chat"])
async def chat_stream(req: ChatReq):
    session_id = req.session_id or create_session()
    return StreamingResponse(
        event_stream(session_id, req.message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def event_stream(session_id: str, message: str):
    """SSE 生成器，逐事件 yield。"""
    async for ev in run_chat_stream(session_id, message):
        yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"


@app.post("/chat/sync", response_model=SyncChatResp, tags=["chat"])
async def chat_sync(req: ChatReq):
    from agent import run_chat_sync_async
    session_id = req.session_id or create_session()
    import asyncio
    result = await run_chat_sync_async(session_id, req.message)
    return SyncChatResp(
        session_id=result["session_id"],
        reply=result["reply"],
        sources=result["sources"],
    )


@app.post("/ingest", response_model=IngestResp, tags=["ingest"])
async def ingest(req: Optional[IngestReq] = None):
    from ingest import main as run_ingest_main
    try:
        run_ingest_main()
        return IngestResp(documents_added=0, files_processed=0, skipped=0)
    except Exception as e:
        logger.exception("文档入库失败")
        raise HTTPException(status_code=500, detail=f"入库失败: {e}")


@app.get("/sessions/{session_id}", response_model=SessionResp, tags=["sessions"])
async def get_session(session_id: str):
    history = get_session_history(session_id)
    if not history:
        raise HTTPException(status_code=404, detail="会话不存在")
    first_ts = history[0].get("ts", datetime.now())
    if isinstance(first_ts, str):
        created_at = datetime.fromisoformat(first_ts)
    else:
        created_at = first_ts
    return SessionResp(
        session_id=session_id,
        messages=history,
        created_at=created_at,
    )
