"""tools.py — 工具注册表（统一 @tool 集合入口）"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from langchain_core.tools import tool

from retriever import retrieve

logger = logging.getLogger(__name__)

# 简单的用户偏好存储（进程内 dict，重启后清空）
_user_prefs: dict[str, str] = {}


# ---------- 基础：知识库检索 ----------

@tool
def search_knowledge_base(query: str, top_k: int = 6) -> str:
    """从内部知识库中检索与问题最相关的内容，返回格式化文本。

    【重要使用规则】这是一次性工具：调用后必须立即整合结果回答问题，
    不得再次调用本工具或其他检索工具（search_recursive、ask_clarification等）。
    仅当返回 status=no_relevant_result 时才可继续思考其他策略。

    Args:
        query: 检索关键词或问题。
        top_k: 返回最多几条结果，默认 6。

    Returns:
        JSON格式：{"status":"relevant"|"no_relevant_result", "result_count":N, ...}
        result_count > 0 时必须停止检索，直接整合回答。
    """
    logger.info("工具调用 search_knowledge_base: %s (top_k=%d)", query, top_k)
    results = retrieve(query, k=top_k)
    if not results:
        return json.dumps({"status": "no_relevant_result", "query": query, "message": "知识库中没有找到与该问题足够相关的内容。", "results": []}, ensure_ascii=False)
    return json.dumps({
        "status": "relevant",
        "result_count": len(results),
        "query": query,
        "results": [{"content": r["formatted"], "source": r["source"], "kind": r["kind"], "score": r["score"], "matched_by": r["channel"]} for r in results],
    }, ensure_ascii=False)


# ---------- ReAct 增强工具 ----------

@tool
def ask_clarification(question: str) -> str:
    """当用户问题模糊、有歧义、缺关键信息时调用，反问澄清而不是瞎检索。
    例如"那个接口怎么配"——不知道指哪个接口，先反问。

    Args:
        question: 需要向用户确认澄清的点。

    Returns:
        一个反问句，直接呈现给用户。
    """
    logger.info("工具调用 ask_clarification: %s", question)
    return f"需要确认一下：{question}？"


@tool
def search_recursive(query: str, follow_ups: Optional[list[str]] = None) -> str:
    """多步检索：首次检索命中概念 A，但答案需要 A 与 B 的关系时，
    用结果里的线索做二次检索（引文追踪）。

    Args:
        query: 首次检索词。
        follow_ups: 由首次结果推断出的后续检索词，可为空。

    Returns:
        多轮检索合并去重后的格式化片段。
    """
    logger.info("工具调用 search_recursive: %s, follow_ups=%s", query, follow_ups)
    seen: set[str] = set()
    merged: list[str] = []
    for q in [query] + (follow_ups or []):
        for r in retrieve(q, k=5):
            key = r["content"][:80]          # 以片段开头粗判去重
            if key not in seen:
                seen.add(key)
                merged.append(r["content"])
    return "\n\n".join(merged) if merged else "知识库中未找到相关内容。"


@tool
def route_to_other(query: str, target: str = "") -> str:
    """知识库里没有相关内容时调用，把请求转给其他能力
    （生图/文章仿写润色/网页搜索等），避免硬说"没有"或编造。

    Args:
        query: 用户的原始诉求。
        target: 目标能力，如 generate_image / writing / web_search，为空则自动判断。

    Returns:
        目标能力的执行结果。
    """
    logger.info("工具调用 route_to_other: %s -> %s", query, target)
    if target not in _OTHER_TOOLS:
        return "未注册的目标能力：" + (target or "（空）") + "。请指定 generate_image / writing / web_search。"
    return _OTHER_TOOLS[target](query)


@tool
def explain_or_run_code(code: str, lang: str = "") -> str:
    """对检索到的代码片段执行、解释或翻译，给出"能跑/什么意思"的答案。
    用于用户问"这段代码能不能跑、是什么意思"。

    Args:
        code: 检索到的代码片段（kind=code）。
        lang: 代码语言，可为空。

    Returns:
        执行结果或分步解释（安全沙箱内执行，禁止破坏性命令）。
    """
    logger.info("工具调用 explain_or_run_code: lang=%s len=%d", lang, len(code))
    return _safe_run_or_explain(code, lang)


@tool
def remember_user_pref(key: str, value: str) -> str:
    """记录用户长期偏好/技术栈，供后续检索自动过滤。
    当发现用户反复问同类问题、或有明确技术栈偏好时调用。

    Args:
        key: 偏好名，如 tech_stack / language。
        value: 偏好值，如 nodejs / 中文。

    Returns:
        确认信息。
    """
    logger.info("工具调用 remember_user_pref: %s=%s", key, value)
    _user_prefs[key] = value
    return f"已记录：{key}={value}"


# ---------- 工具清单 ----------

TOOLS = [
    search_knowledge_base,
    ask_clarification,
    search_recursive,
    route_to_other,
    explain_or_run_code,
    remember_user_pref,
]


def get_tool_names() -> list[str]:
    return [t.name for t in TOOLS]


def get_tools() -> list:
    return TOOLS


# ---------- 辅助实现（route_to_other / explain_or_run_code 依赖） ----------

# 可转的其他能力（target -> 处理函数）。基础版先返回占位，接入后替换。
_OTHER_TOOLS: dict[str, Any] = {
    "generate_image": lambda q: "（生图能力待接入）请用文字描述想要的图片。",
    "writing": lambda q: "（写作能力待接入）请提供要仿写/润色的原文。",
    "web_search": lambda q: f"（网页搜索待接入）需求：{q}",
}


def _safe_run_or_explain(code: str, lang: str = "") -> str:
    """安全执行或解释代码。基础版：仅解释、不实际执行；执行必须在沙箱隔离。"""
    return (
        f"（代码解释）这是 {lang or '未知'} 代码片段，约 {len(code.splitlines())} 行。"
        "基础版暂不执行，仅返回代码原文供参考。接入时必须在沙箱内执行并禁止破坏性命令。"
    )
