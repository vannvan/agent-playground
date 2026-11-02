"""config.py — 集中配置加载（环境变量 + .env）"""
from __future__ import annotations

from functools import lru_cache
import os
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ai_model: str = "gpt-4o-mini"
    ai_base_url: str = ""
    ai_api_key: str = ""
    ai_system_prompt: str = (
        "你是基于内部知识库回答的助手。给定若干知识片段和用户问题，按以下规则回答：\n"
        "1. 只用片段里的事实，片段没提到的不要编造，资料没有就直说\"没有相关信息\"。\n"
        "2. 禁止使用\"结果1 / 结果2 / 结果3\"或\"① ② ③\"这类条目标题，将多个相关片段融合成自然的主题段落。\n"
        "3. 同一主题的内容放同一段，不同主题分段落，每段直接陈述结论。\n"
        "4. 默认 3-5 句讲清核心结论，除非用户明确要求展开细节。\n"
        "5. 像向同事口头解释，自然简洁，避免\"根据资料显示\"这类文档腔。"
    )
    recursion_limit: int = 8
    data_dir: Path = Path("data")
    db_dir: Path = Path("vector_db")
    session_ttl: int = 3600
    embedding_model: str = "BAAI/bge-small-zh-v1.5"
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


def _build_system_prompt() -> str:
    """拼接系统提示词，\n 转为真实换行符。"""
    raw = """你是基于内部知识库回答的助手。给定若干知识片段和用户问题，按以下规则回答：
1. 只用片段里的事实，片段没提到的不要编造，资料没有就直说"没有相关信息"。
2. 禁止使用"结果1 / 结果2 / 结果3"或"① ② ③"这类条目标题，将多个相关片段融合成自然的主题段落。
3. 同一主题的内容放同一段，不同主题分段落，每段直接陈述结论。
4. 默认 3-5 句讲清核心结论，除非用户明确要求展开细节。
5. 像向同事口头解释，自然简洁，避免"根据资料显示"这类文档腔。"""
    env_val = os.getenv("AI_SYSTEM_PROMPT", "")
    return env_val if env_val else raw


@lru_cache
def get_settings() -> Settings:
    cfg = Settings()
    cfg.ai_system_prompt = _build_system_prompt()
    return cfg


def get_ai_config() -> dict:
    """返回传给 LangChain 的 LLM 配置字典。"""
    cfg = get_settings()
    kwargs: dict[str, object] = {"model": cfg.ai_model}
    if cfg.ai_api_key:
        kwargs["api_key"] = cfg.ai_api_key
    if cfg.ai_base_url:
        kwargs["base_url"] = cfg.ai_base_url
    return kwargs
