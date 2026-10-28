"""schemas.py — 统一请求/响应 Pydantic 模型"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, Field


class ChatReq(BaseModel):
    message: str = Field(..., min_length=1, description="用户消息")
    session_id: Optional[str] = Field(None, description="会话 ID，缺失则自动创建")


class IngestReq(BaseModel):
    source_dir: Optional[str] = Field(None, description="文档目录；缺省用配置的 DATA_DIR")


class HealthResp(BaseModel):
    status: str = "ok"
    model: str
    tool_count: int
    tools: list[str]


class ToolsResp(BaseModel):
    tools: list[str]


class SyncChatResp(BaseModel):
    session_id: str
    reply: str
    sources: list[dict[str, Any]] = Field(default_factory=list)


class IngestResp(BaseModel):
    documents_added: int
    files_processed: int
    skipped: int


class SessionResp(BaseModel):
    session_id: str
    messages: list[dict[str, Any]]
    created_at: datetime


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
