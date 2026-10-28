"""memory.py — 会话与长期记忆（基础版：内存，预留 Redis/DB 扩展点）"""
from __future__ import annotations

import logging
import uuid
from collections import OrderedDict
from datetime import datetime, timedelta
from typing import Optional, Any

import threading

logger = logging.getLogger(__name__)

# 每条消息格式：{"role": "user"|"assistant"|"system", "content": str, "ts": datetime}
Session = dict[str, Any]
_sessions: OrderedDict[str, Session] = OrderedDict()
_lock = threading.Lock()


def _cleanup_expired(ttl: int) -> None:
    """清理过期会话（惰性调用，不在热路径里跑）。"""
    now = datetime.now()
    expired = [sid for sid, s in _sessions.items() if (now - s["created_at"]).total_seconds() > ttl]
    for sid in expired:
        del _sessions[sid]
        logger.info("会话 %s 已过期清理", sid)


def create_session() -> str:
    sid = uuid.uuid4().hex[:12]
    with _lock:
        _sessions[sid] = {
            "messages": [],
            "created_at": datetime.now(),
        }
    logger.info("新建会话 %s", sid)
    return sid


def add_message(session_id: str, role: str, content: str) -> None:
    with _lock:
        if session_id not in _sessions:
            _sessions[session_id] = {"messages": [], "created_at": datetime.now()}
        _sessions[session_id]["messages"].append({
            "role": role,
            "content": content,
            "ts": datetime.now().isoformat(),
        })


def get_messages(session_id: str) -> list[dict[str, str]]:
    with _lock:
        if session_id not in _sessions:
            return []
        return [
            {"role": m["role"], "content": m["content"]}
            for m in _sessions[session_id]["messages"]
        ]


def get_session(session_id: str) -> Optional[Session]:
    with _lock:
        return _sessions.get(session_id)


def get_session_history(session_id: str) -> list[dict[str, Any]]:
    """返回完整记录（含 ts），供 /sessions/{id} 接口使用。"""
    with _lock:
        sess = _sessions.get(session_id)
        if sess is None:
            return []
        return sess["messages"]


def prune_expired_sessions(ttl: Optional[int] = None) -> int:
    cfg = __import__("config", fromlist=["get_settings"]).get_settings()
    ttl = ttl or cfg.session_ttl
    before = len(_sessions)
    _cleanup_expired(ttl)
    return before - len(_sessions)
