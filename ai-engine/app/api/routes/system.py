from fastapi import APIRouter

from app.api.schemas import HealthResp, ToolsResp
from app.chat.tools import TOOLS, get_tool_names
from app.core.config import get_settings

router = APIRouter()


@router.get("/", tags=["root"])
async def root():
    return {
        "service": "Python AI Engine",
        "version": "0.1.0",
        "docs": "/docs",
        "endpoints": [
            "GET  /health",
            "GET  /tools",
            "POST /chat/stream",
            "POST /chat/plain/stream",
            "POST /chat/sync",
            "POST /ingest",
            "GET  /sessions/{id}",
        ],
    }


@router.get("/health", response_model=HealthResp, tags=["health"])
async def health():
    settings = get_settings()
    return HealthResp(
        status="ok",
        model=settings.ai_model,
        tool_count=len(TOOLS),
        tools=get_tool_names(),
    )


@router.get("/tools", response_model=ToolsResp, tags=["tools"])
async def list_tools():
    return ToolsResp(tools=get_tool_names())
