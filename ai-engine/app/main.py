"""FastAPI application factory."""
from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router
from app.chat.tools import get_tool_names
from app.core.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    logger.info("=" * 50)
    logger.info("Python AI Engine 启动")
    logger.info("模型：%s  |  BaseURL：%s", settings.ai_model, settings.ai_base_url or "(default)")
    logger.info("可用工具：%s", get_tool_names())
    logger.info("=" * 50)
    yield
    logger.info("Python AI Engine 关闭")


def create_app() -> FastAPI:
    application = FastAPI(
        title="Python AI Engine",
        description="AI 能力引擎 — 只做 AI 编排与执行",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.include_router(api_router)
    return application


app = create_app()
