"""tools.py — 工具注册表（统一 @tool 集合入口）"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.tools import tool

from retriever import retrieve

logger = logging.getLogger(__name__)


@tool
def search_knowledge_base(query: str, top_k: int = 6) -> str:
    """从内部知识库中检索与问题最相关的内容，返回格式化文本。

    Args:
        query: 检索关键词或问题。
        top_k: 返回最多几条结果，默认 6。

    Returns:
        格式化检索结果，每条含来源文件与类型前缀，供 LLM 整合回答。
    """
    logger.info("工具调用 search_knowledge_base: %s (top_k=%d)", query, top_k)
    results = retrieve(query, k=top_k)
    if not results:
        return "知识库中未找到相关内容。"
    return "\n\n".join(r["content"] for r in results)


# 工具清单（供 /tools 接口和 Agent 构建使用）
TOOLS = [search_knowledge_base]


def get_tool_names() -> list[str]:
    return [t.name for t in TOOLS]


def get_tools() -> list:
    return TOOLS
