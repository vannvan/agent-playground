from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.chat.agent import run_chat_stream, run_chat_sync_async, run_plain_chat_stream
from app.chat.schemas import ChatReq, SyncChatResp
from app.sessions.memory import create_session

router = APIRouter()


@router.post("/chat/stream", tags=["chat"])
async def chat_stream(req: ChatReq):
    session_id = req.session_id or create_session()
    return StreamingResponse(
        event_stream(session_id, req.message, req.system_prompt, req.history, req.context_questions),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def event_stream(
    session_id: str,
    message: str,
    system_prompt: str | None = None,
    history: list[dict[str, str]] | None = None,
    context_questions: list[str] | None = None,
):
    """SSE 生成器，逐事件 yield。"""
    import logging

    logger = logging.getLogger(__name__)
    logger.info(
        "event_stream: session_id=%s message_len=%d history_len=%s ctx_len=%s",
        session_id,
        len(message),
        len(history) if history else None,
        len(context_questions) if context_questions else None,
    )
    async for event in run_chat_stream(
        session_id,
        message,
        system_prompt,
        history,
        context_questions,
    ):
        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def plain_event_stream(session_id: str, message: str):
    """纯聊天 SSE 生成器（无工具）。"""
    async for event in run_plain_chat_stream(session_id, message):
        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/chat/plain/stream", tags=["chat"])
async def chat_plain_stream(req: ChatReq):
    """纯 LLM 流式对话，不走 Agent graph，不调用工具。"""
    session_id = req.session_id or create_session()
    return StreamingResponse(
        plain_event_stream(session_id, req.message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/sync", response_model=SyncChatResp, tags=["chat"])
async def chat_sync(req: ChatReq):
    session_id = req.session_id or create_session()
    result = await run_chat_sync_async(session_id, req.message)
    return SyncChatResp(
        session_id=result["session_id"],
        reply=result["reply"],
        sources=result["sources"],
    )
