"""query_rewriter.py — 查询改写：把追问补全为自包含检索查询

判定 + 改写在一次 LLM 调用中完成：
- 自包含问题（有完整主语，脱离上下文可理解）→ 原样返回
- 追问（省略主语/代词指代/语义依赖前文）→ 结合上下文补全
- 话题切换（用户明确换新话题）→ 原样返回，不强行关联

失败兜底：任何异常返回原问题，不阻断检索链路。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from langchain_openai import ChatOpenAI

from config import get_settings

logger = logging.getLogger(__name__)

_REWRITE_PROMPT = """\
你是查询改写助手。判断用户最新问题是否依赖对话上下文才能理解，并按规则输出。

判定规则：
1. 自包含：问题有完整主语，脱离上下文也能理解 → 原样返回
2. 追问：省略主语、使用代词（它/这个/那个）、或语义依赖前文 → 结合上下文改写为自包含查询
3. 话题切换：用户明确换了新话题（即使问题很短）→ 原样返回，不要强行关联上下文

改写要求：
- 保留用户核心意图，补全缺失的主语/宾语
- 输出适合做关键词检索的短语，不要输出完整句子

上下文（最近几轮用户问题）：
{context}

最新问题：{question}

只输出一行 JSON，不要解释：
{{"is_follow_up": true/false, "query": "..."}}
"""


async def rewrite_query(
    question: str,
    context_questions: list[str] | None = None,
) -> str:
    """把追问改写为自包含查询；自包含或失败时返回原问题。

    Args:
        question: 当前用户问题。
        context_questions: 最近几轮用户问题（仅 user 侧，不含 assistant）。

    Returns:
        自包含的检索查询（可能是原问题）。
    """
    if not context_questions:
        # 无上下文（首轮），无需改写
        return question

    context_text = "\n".join(f"- {q}" for q in context_questions[-2:])
    prompt = _REWRITE_PROMPT.format(context=context_text, question=question)

    try:
        cfg = get_settings()
        llm_kwargs: dict[str, Any] = {
            "model": cfg.ai_model,
            "temperature": 0,
            "max_tokens": 200,
        }
        if cfg.ai_base_url:
            llm_kwargs["base_url"] = cfg.ai_base_url
        if cfg.ai_api_key:
            llm_kwargs["api_key"] = cfg.ai_api_key

        llm = ChatOpenAI(**llm_kwargs)
        response = await llm.ainvoke(prompt)
        raw = response.content.strip() if hasattr(response, "content") else str(response)

        # 提取 JSON（兼容模型输出含 ```json 包裹的情况）
        if raw.startswith("```"):
            raw = raw.strip("`").lstrip("json").strip()
        data = json.loads(raw)

        query = data.get("query", "").strip()
        is_follow_up = bool(data.get("is_follow_up"))

        if is_follow_up and query:
            logger.info("查询改写: %r → %r (is_follow_up=%s)", question, query, is_follow_up)
            return query

        logger.info("查询无需改写: %r (is_follow_up=%s)", question, is_follow_up)
        return question

    except Exception as e:
        # 任何失败（超时/解析失败/限流）都降级用原问题，不阻断检索
        logger.warning("查询改写失败，降级使用原问题: %s (%s)", question, e)
        return question
