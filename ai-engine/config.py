"""config.py — 集中配置加载（环境变量 + .env）"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ai_model: str = "gpt-4o-mini"
    ai_base_url: str = ""
    ai_api_key: str = ""
    ai_system_prompt: str = (
        "你是基于内部知识库回答的助手，优先用检索结果作答并注明来源，"
        "检索不到时如实说明，不要编造。"
    )
    recursion_limit: int = 8
    data_dir: Path = Path("data")
    db_dir: Path = Path("vector_db")
    session_ttl: int = 3600
    embedding_model: str = "BAAI/bge-small-zh-v1.5"
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_ai_config() -> dict:
    """返回传给 LangChain 的 LLM 配置字典。"""
    cfg = get_settings()
    kwargs: dict[str, object] = {"model": cfg.ai_model}
    if cfg.ai_api_key:
        kwargs["api_key"] = cfg.ai_api_key
    if cfg.ai_base_url:
        kwargs["base_url"] = cfg.ai_base_url
    return kwargs
