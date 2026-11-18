from fastapi import APIRouter

from app.api.routes import chat, knowledge_base, sessions, system

api_router = APIRouter()
api_router.include_router(system.router)
api_router.include_router(chat.router)
api_router.include_router(knowledge_base.router)
api_router.include_router(sessions.router)
