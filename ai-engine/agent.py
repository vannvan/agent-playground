"""agent.py — LangGraph 编排（graph 编译、工具绑定、流式生成）"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, AsyncIterator

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph, START

from config import get_settings
from tools import get_tools
from memory import create_session, add_message, get_messages

logger = logging.getLogger(__name__)


# ── Agent 状态定义 ─────────────────────────────────────────────────────────────
class AgentState(dict):
    """LangGraph 节点间传递的状态，兼容 dict 以便直接传给 LLM。"""
    messages: list[Any]
    session_id: str
    sources: list[dict[str, Any]]

    def __init__(self, session_id: str, messages: list[Any] | None = None, **extra):
        super().__init__(**extra)
        self["messages"] = messages or []
        self["session_id"] = session_id
        self["sources"] = []

    def __setitem__(self, key, value):
        super().__setitem__(key, value)

    def __getitem__(self, key):
        return super().__getitem__(key)

    def get(self, key, default=None):
        return super().get(key, default)


# ── 节点实现 ───────────────────────────────────────────────────────────────────

def chat_node(state: AgentState) -> dict:
    """调用 LLM，将历史 + 系统提示 + 工具一起传入。"""
    cfg = get_settings()
    llm_kwargs = {
        "model": cfg.ai_model,
        "temperature": 0,
    }
    if cfg.ai_base_url:
        llm_kwargs["base_url"] = cfg.ai_base_url
    if cfg.ai_api_key:
        llm_kwargs["api_key"] = cfg.ai_api_key

    llm = ChatOpenAI(**llm_kwargs)
    msgs: list[Any] = list(state["messages"])
    system_msg = SystemMessage(content=cfg.ai_system_prompt)
    if not any(isinstance(m, SystemMessage) for m in msgs):
        msgs.insert(0, system_msg)

    bound = llm.bind_tools(get_tools())
    response = bound.invoke(msgs)
    logger.info("LLM 响应：role=%s tool_calls=%s",
                response.type, len(response.tool_calls) if response.tool_calls else 0)
    return {"messages": [response], "sources": []}


def tool_node(state: AgentState) -> dict:
    """执行工具调用，收集结果并追加到消息序列。"""
    from tools import search_knowledge_base

    tool_map = {t.name: t for t in get_tools()}
    responses = []
    all_sources: list[dict[str, Any]] = []

    last_msg = state["messages"][-1]
    tool_calls = getattr(last_msg, "tool_calls", []) or []

    for tc in tool_calls:
        tool = tool_map.get(tc["name"])
        if tool is None:
            content = f"工具 {tc['name']} 不存在"
        else:
            try:
                result = tool.invoke(tc["args"])
                content = str(result)
            except Exception as e:
                logger.exception("工具 %s 执行异常", tc["name"])
                content = f"工具执行出错: {e}"

        responses.append(AIMessage(content=content, additional_kwargs={"tool_call_id": tc["id"]}))

        if tc["name"] == "search_knowledge_base":
            try:
                args = json.loads(tc["args"]) if isinstance(tc["args"], str) else tc["args"]
                query = args.get("query", "")
                from retriever import retriever
                all_sources.extend(retriever(query, k=args.get("top_k", 4)))
            except Exception:
                pass

    return {"messages": responses, "sources": all_sources}


def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", []) or []
    if tool_calls:
        return "tools"
    return END


# ── Graph 编译 ─────────────────────────────────────────────────────────────────

def build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("chat", chat_node)
    graph.add_node("tools", tool_node)
    graph.add_edge(START, "chat")
    graph.add_conditional_edges("chat", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "chat")
    return graph.compile()


# ── 公开 API ───────────────────────────────────────────────────────────────────

_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


def _make_config() -> dict:
    return {"recursion_limit": get_settings().recursion_limit}


async def run_chat_stream(session_id: str, user_message: str) -> AsyncIterator[dict]:
    """流式对话入口，yield SSE 事件 dict。

    使用 graph.astream(stream_mode="updates") 逐节点获取增量状态，
    从 AIMessage 中提取文本和工具调用事件。
    """
    start_ts = time.time()
    graph = get_graph()

    msgs = [HumanMessage(content=user_message)]
    state = AgentState(session_id=session_id, messages=msgs)
    config = _make_config()

    try:
        async for chunk in graph.astream(state, config=config, stream_mode="updates"):
            # chunk 形如 {"chat": {"messages": [AIMessage(...)]}}
            for node_output in chunk.values():
                if not isinstance(node_output, dict):
                    continue
                new_msgs = node_output.get("messages", [])
                for msg in new_msgs:
                    if isinstance(msg, AIMessage):
                        # 工具调用事件
                        tool_calls = getattr(msg, "tool_calls", []) or []
                        for tc in tool_calls:
                            yield {"type": "tool", "name": tc["name"],
                                   "args": json.dumps(tc["args"], ensure_ascii=False)}
                        # 文本内容事件
                        if msg.content:
                            yield {"type": "text", "content": msg.content}

            # 来源信息（工具调用后由 tool_node 写入）
            if "sources" in chunk and chunk["sources"]:
                yield {"type": "sources", "sources": chunk["sources"]}

        yield {"type": "done", "session_id": session_id}

    except Exception as e:
        logger.exception("流式对话异常")
        yield {"type": "error", "message": str(e)}
        yield {"type": "done", "session_id": session_id}

    finally:
        add_message(session_id, "user", user_message)
        elapsed = time.time() - start_ts
        logger.info("会话 %s 对话完成，耗时 %.2fs", session_id, elapsed)


async def run_chat_sync_async(session_id: str, user_message: str) -> dict[str, Any]:
    """非流式对话（调试用）—— 异步版本。

    只收集最后一条无 tool_calls 的 AIMessage 的 content 作为回复，
    跳过中间工具调用的格式化输出文本。
    """
    sources_list: list[dict] = []
    final_reply = ""

    if not session_id:
        session_id = create_session()

    async for ev in run_chat_stream(session_id, user_message):
        if ev["type"] == "sources":
            sources_list.extend(ev["sources"])
        elif ev["type"] == "text" and ev.get("content"):
            # 保留最后一段非空的文本作为最终回复
            final_reply = ev["content"]

    final_reply = final_reply.strip()
    add_message(session_id, "assistant", final_reply)

    return {
        "session_id": session_id,
        "reply": final_reply,
        "sources": sources_list,
    }



def run_chat_sync(session_id: str, user_message: str) -> dict[str, Any]:
    """非流式对话（调试用）—— 同步包装（不推荐在生产环境使用）。"""
    import asyncio
    from asyncio import new_event_loop, set_event_loop

    result_dict: dict[str, Any] = {"session_id": session_id, "reply": "", "sources": []}

    def _run():
        loop = new_event_loop()
        set_event_loop(loop)
        try:
            coro = run_chat_sync_async(session_id, user_message)
            result = loop.run_until_complete(coro)
            result_dict.update(result)
        finally:
            loop.close()

    _run()
    return result_dict
