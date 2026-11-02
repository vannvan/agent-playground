"""retriever.py — 混合检索：向量通道 + BM25 通道，统一合并去重"""
from __future__ import annotations

import logging
from typing import Any, Optional

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


# ── 通道 A：向量检索 ──────────────────────────────────────────────────────────

def _vector_search(query: str, k: int) -> list[tuple[Any, float]]:
    """通道 A：对全量片段（text + code）做向量相似度检索。"""
    db, _ = _ensure_initialized()
    try:
        return db.similarity_search_with_relevance_scores(query, k=k)
    except Exception as e:
        logger.warning("向量检索失败：%s", e)
        return []


# ── 通道 B：BM25 关键词检索（接口预留，当前为空实现） ────────────────────────

def _bm25_search(query: str, k: int) -> list[tuple[Any, float]]:
    """通道 B：BM25 关键词检索（启动时加载 corpus，暂不接入 rank_bm25）。

    TODO: 接入 rank_bm25，在 _ensure_initialized() 后构建倒排索引。
    """
    # 起步阶段：返回空列表，后续接入 rank_bm25 后填充逻辑
    return []


# ── 合并工具 ──────────────────────────────────────────────────────────────────

def _doc_id(doc: Any) -> str:
    """用 page_content + source 作自然去重键，避免同一知识被两路重复召回。"""
    return f"{doc.page_content}||{doc.metadata.get('source', '')}"


def _format_result(
    doc: Any,
    channel: str,
    score: float,
) -> dict[str, Any]:
    """将单条结果格式化为工具调用标准格式。

    格式：[来源:文件名][类型:文本/代码] 片段内容
    """
    kind_raw = doc.metadata.get("kind", "text")
    kind_label = "文本" if kind_raw == "text" else "代码"
    source = doc.metadata.get("source", "unknown")
    filename = source.split("/")[-1] if source else "unknown"
    content = doc.page_content

    return {
        "content": content,
        "formatted": f"[来源:{filename}][类型:{kind_label}] {content}",
        "source": source,
        "score": round(score, 4),
        "kind": kind_raw,
        "channel": channel,   # "vector" / "bm25" / "dual"
        "lang": doc.metadata.get("lang", ""),
    }


def retrieve(query: str, k: int = 6) -> list[dict[str, Any]]:
    """混合检索主入口：通道 A（向量）+ 通道 B（BM25），去重合并后返回。

    Args:
        query: 用户查询字符串。
        k: 最终返回的最大结果数，默认 6。

    Returns:
        格式化后的结果列表，每条含 formatted / content / source / kind 等字段。
    """
    # ── 通道 A：向量检索 ───────────────────────────────────────────────────
    vector_hits = _vector_search(query, k=k)
    logger.info("通道A（向量）命中 %d 条", len(vector_hits))

    # ── 通道 B：BM25 关键词检索（接口预留） ────────────────────────────────
    bm25_hits = _bm25_search(query, k=k)
    logger.info("通道B（BM25）命中 %d 条", len(bm25_hits))

    # ── 合并去重：按 (page_content + source) 作为唯一键 ────────────────────
    indexed: dict[str, dict[str, Any]] = {}

    def _index(doc: Any, score: float, channel: str) -> None:
        key = _doc_id(doc)
        if key in indexed:
            # 两路都命中 → 标记 dual，取更高 score
            existing = indexed[key]
            existing["channel"] = "dual"
            if score > existing["score"]:
                existing["score"] = score
        else:
            indexed[key] = _format_result(doc, channel, score)

    for doc, score in vector_hits:
        _index(doc, score, "vector")

    for doc, score in bm25_hits:
        _index(doc, score, "bm25")

    # ── 排序并截取 ─────────────────────────────────────────────────────────
    items = list(indexed.values())
    items.sort(key=lambda x: x["score"], reverse=True)
    return items[:k]


# ── 兼容旧接口 ────────────────────────────────────────────────────────────────

def retriever(query: str, k: int = 4) -> list[dict[str, Any]]:
    """旧接口，内部委托给新的 retrieve()。"""
    return retrieve(query, k=k)


def get_db() -> Chroma:
    db, _ = _ensure_initialized()
    return db


def collection_count() -> int:
    try:
        return len(get_db().get()["ids"])
    except Exception:
        return 0
