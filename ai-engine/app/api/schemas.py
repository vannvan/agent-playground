"""Shared API response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class HealthResp(BaseModel):
    status: str = "ok"
    model: str
    tool_count: int
    tools: list[str]


class ToolsResp(BaseModel):
    tools: list[str]


class SessionResp(BaseModel):
    session_id: str
    messages: list[dict[str, Any]]
    created_at: datetime
