from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.api.schemas import SessionResp
from app.sessions.memory import get_session_history

router = APIRouter()


@router.get("/sessions/{session_id}", response_model=SessionResp, tags=["sessions"])
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
