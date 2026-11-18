"""Chat API request and response schemas."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class ChatReq(BaseModel):
    message: str = Field(..., min_length=1, description="用户消息")
    session_id: Optional[str] = Field(None, description="会话 ID，缺失则自动创建")
    system_prompt: Optional[str] = Field(None, description="可选：覆盖默认系统提示词")
    history: Optional[list[dict[str, Any]]] = Field(None, description="可选：前置对话历史 [{role, content}]")
    context_questions: Optional[list[str]] = Field(None, description="可选：最近几轮用户问题，供查询改写")


class SyncChatResp(BaseModel):
    session_id: str
    reply: str
    sources: list[dict[str, Any]] = Field(default_factory=list)


class SseTextEvent(BaseModel):
    type: str = "text"
    content: str


class SseToolEvent(BaseModel):
    type: str = "tool"
    name: str
    args: str


class SseDoneEvent(BaseModel):
    type: str = "done"
    session_id: str


class SseErrorEvent(BaseModel):
    type: str = "error"
    message: str


class SseSourcesEvent(BaseModel):
    type: str = "sources"
    sources: list[dict[str, Any]]
    citations: list[dict[str, Any]] = Field(default_factory=list)
