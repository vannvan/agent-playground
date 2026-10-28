"""retriever.py — 向量检索实现（Chroma，预留 pgvector 扩展点）"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional, Any

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

from config import get_settings

logger = logging.getLogger(__name__)

_db: Optional[Chroma] = None
_embedding_fn: Optional[HuggingFaceEmbeddings] = None


def _ensure_initialized() -> tuple[Chroma, HuggingFaceEmbeddings]:
    global _db, _embedding_fn
    if _db is not None:
        return _db, _embedding_fn  # type: ignore
    cfg = get_settings()
    _embedding_fn = HuggingFaceEmbeddings(model_name=cfg.embedding_model)
    _db = Chroma(
        persist_directory=str(cfg.db_dir),
        embedding_function=_embedding_fn,
    )
    logger.info("Chroma 向量库已加载：%s", cfg.db_dir)
    return _db, _embedding_fn


@lru_cache
def retriever(query: str, k: int = 4) -> list[dict[str, Any]]:
    """执行相似度检索，返回列表 dict（含 page_content / source / score）。"""
    db, _ = _ensure_initialized()
    results = db.similarity_search_with_relevance_scores(query, k=k)
    out: list[dict[str, Any]] = []
    for doc, score in results:
        out.append({
            "content": doc.page_content,
            "source": doc.metadata.get("source", "unknown"),
            "score": round(score, 4),
        })
    return out


def get_db() -> Chroma:
    db, _ = _ensure_initialized()
    return db


def collection_count() -> int:
    try:
        return len(get_db().get()["ids"])
    except Exception:
        return 0
