"""normalize.py — 文档预处理：代码块保留、URL 脱敏、文本切分"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from langchain_core.documents import Document

# ── 正则 ──────────────────────────────────────────────────────────────────────
# 匹配 fenced code block（```lang ... ``` 或 ~~~ ... ~~~）
_FENCE_RE = re.compile(
    r"^(`{3,}|~{3,})\s*(\w+)?\s*$", re.MULTILINE   # 围栏行
)
_CODE_BLOCK_RE = re.compile(
    r"(`{3,}|~{3,})\s*(\w+)?\s*\n(.*?)\n\s*\1",
    re.DOTALL | re.MULTILINE,
)
# 匹配裸 URL（http/https，不含方括号）
_URL_RE = re.compile(
    r"https?://[^\s\]\)]+", re.IGNORECASE
)


def _clean_meta(meta: dict) -> dict:
    """Chroma 不允许空 list 作为 metadata，过滤掉空列表值。"""
    return {k: v for k, v in meta.items() if not (isinstance(v, list) and len(v) == 0)}


def normalize_document(doc: Document) -> list[Document]:
    """将一份文档拆分为 code 块（原样保留）和 text 块（URL 脱敏），返回列表。"""
    content: str = doc.page_content or ""
    meta: dict[str, Any] = dict(doc.metadata)
    source: str = meta.get("source", "")

    # ── 提取代码块 ──────────────────────────────────────────────────────────
    code_chunks: list[tuple[str, str, str]] = []  # (lang, full_code, span)
    for m in _CODE_BLOCK_RE.finditer(content):
        fence = m.group(1)[0]       # "`" 或 "~"
        lang  = (m.group(2) or "text").strip().lower()
        code  = m.group(3)
        # 去掉末尾可能的围栏符
        code = code.rstrip(fence)
        code_chunks.append((lang, code, m.span()))

    # ── 提取正文中的裸 URL ──────────────────────────────────────────────────
    links: list[str] = _URL_RE.findall(content)
    # 只统计唯一链接
    seen: set[str] = set()
    unique_links: list[str] = []
    for u in links:
        if u not in seen:
            seen.add(u)
            unique_links.append(u)

    # ── 构造结果文档 ─────────────────────────────────────────────────────────
    out: list[Document] = []

    # 1) 代码块：每块一份 Document，原样入库
    for lang, code, span in code_chunks:
        out.append(Document(
            page_content=code,
            metadata=_clean_meta({
                **meta,
                "kind": "code",
                "lang": lang,
                "links": unique_links if unique_links else None,
                "source": source,
            }),
        ))

    # 2) 正文：去掉所有代码块 span，再替换裸 URL → [链接]
    removed_spans: set[tuple[int, int]] = set((s, e) for _, _, (s, e) in code_chunks)
    # 构建不含代码块的正文
    segments: list[str] = []
    prev_end = 0
    for _, _, (s, e) in sorted(code_chunks, key=lambda x: x[2][0]):
        segments.append(content[prev_end:s])
        prev_end = e
    segments.append(content[prev_end:])
    normalized = "".join(segments)
    # 将裸 URL 替换为 [链接]，避免 embedding 被 URL 噪声干扰
    normalized = _URL_RE.sub("[链接]", normalized)
    # 跳过空块和纯空白块
    if normalized.strip():
        out.append(Document(
            page_content=normalized,
            metadata=_clean_meta({
                **meta,
                "kind": "text",
                "lang": "",
                "links": unique_links if unique_links else None,
                "source": source,
            }),
        ))

    # 若全文无代码块且无正文，返回原始文档（保持兼容性）
    if not out:
        out.append(Document(
            page_content=content,
            metadata=_clean_meta({**meta, "kind": "text", "lang": "", "links": None}),
        ))

    return out
