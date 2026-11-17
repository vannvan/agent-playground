"""agent.py — LangGraph 编排（graph 编译、工具绑定、流式生成）"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, AsyncIterator

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
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
        self["consecutive_no_relevant"] = extra.get("consecutive_no_relevant", 0)
        self["tool_call_count"] = extra.get("tool_call_count", 0)
        self["tool_fail_count"] = extra.get("tool_fail_count", 0)
        self["consecutive_kb_search"] = extra.get("consecutive_kb_search", 0)

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
    # 强制停止协议：无论是否已有 system prompt，都确保追加
    tool_protocol = (
        "\n\n【检索结果处理规则】"
        "search_knowledge_base 返回 status=relevant 时，表示已获取知识片段，"
        "必须立即整合回答，不得再次调用任何检索工具（包括 search_recursive、ask_clarification）。"
        "只有当返回 status=no_relevant_result 时，才回复：知识库中没有找到与相关问题相关的信息。"
    )
    has_tool_protocol = any(
        "检索结果处理规则" in getattr(m, "content", "")
        for m in msgs if hasattr(m, "content")
    )
    if not has_tool_protocol:
        existing_sys = next((m for m in msgs if isinstance(m, SystemMessage)), None)
        if existing_sys:
            existing_sys.content = existing_sys.content + tool_protocol
        else:
            msgs.insert(0, SystemMessage(content=tool_protocol.lstrip()))

    bound = llm.bind_tools(get_tools())
    response = bound.invoke(msgs)
    n_tc = len(response.tool_calls) if response.tool_calls else 0
    prev_tc = state.get("tool_call_count", 0)
    logger.info("LLM 响应：role=%s tool_calls=%s",
                response.type, n_tc)
    msgs.append(response)
    # 最多允许 N 次工具调用，防止无限循环
    MAX_TOOL_CALLS = get_settings().recursion_limit - 2  # 留余量给最终回复
    new_tc = prev_tc + n_tc
    # 硬上限：即使 LLM 忽略停止指令，3 轮工具调用后也必须结束。
    # 通过将 tool_call_count 设为超限值，使 should_continue 直接返回 END。
    if new_tc >= 3:
        logger.warning("已达到工具调用硬上限 %d，强制终止", new_tc)
        return {"messages": msgs, "sources": [], "tool_call_count": get_settings().recursion_limit}
    return {"messages": msgs, "sources": [], "tool_call_count": new_tc}


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

        responses.append(ToolMessage(content=content, tool_call_id=tc["id"]))

        if tc["name"] == "search_knowledge_base":
            try:
                payload = json.loads(content)
                if payload.get("status") == "no_relevant_result":
                    prev_count = state.get("consecutive_no_relevant", 0)
                    state["consecutive_no_relevant"] = prev_count + 1
                else:
                    state["consecutive_no_relevant"] = 0
                all_sources.extend(payload.get("results", []))
            except (TypeError, json.JSONDecodeError):
                pass

    # 统计本轮工具失败次数；只要有一个成功就重置计数
    prev_fails = state.get("tool_fail_count", 0)
    had_error = any("工具执行出错" in r.content for r in responses)
    has_success = any("工具执行出错" not in r.content for r in responses)
    new_fails = (prev_fails + 1) if had_error and not has_success else 0
    msgs = list(state["messages"]) + responses
    # 统计连续空检索次数（LLM 反复调 search_knowledge_base 但不回答时终止）
    prev_kb = state.get("consecutive_kb_search", 0)
    new_kb = prev_kb + 1 if not all_sources else 0
    return {"messages": msgs, "sources": all_sources,
            "consecutive_no_relevant": state.get("consecutive_no_relevant", 0),
            "tool_fail_count": new_fails,
            "consecutive_kb_search": new_kb,
            "tool_call_count": state.get("tool_call_count", 0)}


def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if isinstance(last, ToolMessage):
        try:
            if json.loads(last.content).get("status") == "no_relevant_result":
                return END
        except (TypeError, json.JSONDecodeError):
            pass
    # 连续无结果则强制停止，防止无限循环
    consecutive = state.get("consecutive_no_relevant", 0)
    if consecutive >= 3:
        return END
    # LLM 连续两次检索知识库均无结果 → 强制结束，不重复徒劳搜索
    if state.get("consecutive_kb_search", 0) >= 2:
        logger.warning("连续 %d 次 KB 检索为空，强制终止", state["consecutive_kb_search"])
        return END
    # 连续工具调用持续报错 → 强制结束，避免空转耗尽 recursion_limit
    if state.get("tool_fail_count", 0) >= 2:
        logger.warning("连续工具调用失败 %d 次，强制终止对话", state["tool_fail_count"])
        return END
    # 总工具调用次数上限
    max_tc = get_settings().recursion_limit - 2
    if state.get("tool_call_count", 0) >= max_tc:
        return END
    # 硬上限：tool_call_count 被 chat_node 设为 recursion_limit 时直接终止
    if state.get("tool_call_count", 0) >= get_settings().recursion_limit:
        logger.info("工具调用已达硬上限，终止对话")
        return END
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


async def run_chat_stream(
    session_id: str,
    user_message: str,
    system_prompt: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> AsyncIterator[dict]:
    """流式对话入口，yield SSE 事件 dict。"""
    start_ts = time.time()
    logger.info("run_chat_stream: session_id=%s msg_len=%d history_len=%s system_prompt_set=%s",
                session_id, len(user_message), len(history) if history else None, bool(system_prompt))
    graph = get_graph()

    # 使用传入的 system_prompt，否则用配置中的默认值
    cfg = get_settings()
    effective_system = system_prompt if system_prompt else cfg.ai_system_prompt
    # 使用传入历史或从内存加载。
    # 注意：history=[] 表示调用方明确不传历史（skill 模式独立请求），
    # 此时不应回退到 memory，否则会加载之前轮次的 user 消息，
    # 导致 LLM 为历史话题生成多余的 tool_calls。
    msgs: list[Any] = []
    if history is not None:
        for h in history:
            role = h.get("role", "user")
            content_h = h.get("content", "")
            if not content_h:
                continue
            if role == "system":
                msgs.append(SystemMessage(content=content_h))
            elif role == "user":
                msgs.append(HumanMessage(content=content_h))
            elif role == "assistant":
                msgs.append(AIMessage(content=content_h))
    else:
        mem = get_messages(session_id)
        for m in mem:
            role = m.get("role", "user")
            content_m = m.get("content", "")
            if not content_m:
                continue
            if role == "system":
                msgs.append(SystemMessage(content=content_m))
            elif role == "user":
                msgs.append(HumanMessage(content=content_m))
            elif role == "assistant":
                msgs.append(AIMessage(content=content_m))
    
    # 注入系统提示（优先用传入值，其次用默认）
    effective_system = system_prompt or cfg.ai_system_prompt
    if not any(isinstance(m, SystemMessage) for m in msgs):
        msgs.insert(0, SystemMessage(content=effective_system))
    
    # 追加当前用户消息
    msgs.append(HumanMessage(content=user_message))
    state = AgentState(session_id=session_id, messages=msgs)
    config = _make_config()

    all_sources = []
    all_texts = []
    no_relevant_result = False
    no_relevant_tool_name = "search_knowledge_base"
    prev_tool_call_ids = set()
    prev_text_message_ids = set()
    # 跳过历史消息（含 history / memory 加载的 AIMessage），只收集本轮新生成的内容。
    # stream_mode="values" 首帧会返回完整初始 state，若从 0 开始处理，
    # 历史 AIMessage 的 content 会被重复加入 all_texts，导致新旧答案拼接。
    last_processed_count = len(msgs)
    try:
        async for chunk in graph.astream(state, config=config, stream_mode="values"):
            messages = chunk.get("messages", [])
            
            # 聚合 sources（取最新值）
            if "sources" in chunk and chunk["sources"]:
                all_sources = chunk["sources"]
            
            # 只处理本轮新增的消息，避免同一消息多次触发事件
            for msg in messages[last_processed_count:]:
                last_processed_count += 1
                if isinstance(msg, ToolMessage):
                    try:
                        payload = json.loads(msg.content)
                        if payload.get("status") == "no_relevant_result":
                            no_relevant_result = True
                            yield {"type": "tool_result", "name": no_relevant_tool_name, "status": "no_relevant_result", "message": payload.get("message", "知识库中没有找到相关内容。")}
                    except (TypeError, json.JSONDecodeError):
                        pass
                elif isinstance(msg, AIMessage):
                    # 工具调用事件（去重）
                    tool_calls = getattr(msg, "tool_calls", []) or []
                    for tc in tool_calls:
                        tc_id = tc.get("id")
                        if tc_id and tc_id not in prev_tool_call_ids:
                            prev_tool_call_ids.add(tc_id)
                            yield {"type": "tool", "name": tc["name"],
                                   "args": json.dumps(tc["args"], ensure_ascii=False)}
                    
                    # 文本内容事件
                    msg_id = getattr(msg, "id", None)
                    if msg.content and msg_id not in prev_text_message_ids:
                        if msg_id is not None:
                            prev_text_message_ids.add(msg_id)
                        all_texts.append(msg.content)

        # 发送最终回复
        # 优先级：no_relevant_result > 工具持续失败兜底 > LLM文本 > 空结果提示
        if no_relevant_result:
            yield {"type": "text", "content": "知识库中没有找到与相关问题相关的信息。"}
        elif not all_texts and all_sources:
            # 检索到了内容但 LLM 未能生成文本（工具链异常），用已知片段作答
            yield {"type": "text", "content": "根据知识库检索到的相关内容：" + "\n".join(s.get("content","") for s in all_sources[:3])}
        elif all_texts:
            yield {"type": "text", "content": "".join(all_texts)}
        else:
            yield {"type": "text", "content": "知识库中没有找到与相关问题相关的信息。"}
        
        # 发送 sources
        yield {"type": "sources", "sources": all_sources}
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
    """非流式对话（调试用）—— 异步版本。"""
    sources_list: list[dict] = []
    final_reply = ""

    if not session_id:
        session_id = create_session()

    async for ev in run_chat_stream(session_id, user_message):
        if ev["type"] == "sources":
            sources_list = ev.get("sources", [])
        elif ev["type"] == "text" and ev.get("content"):
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


# ── 普通聊天（无工具，纯 LLM 流式）──────────────────────────────────────────

async def run_plain_chat_stream(
    session_id: str,
    user_message: str,
    history: list[dict[str, Any]] | None = None,
) -> AsyncIterator[dict]:
    """直接调用 LLM 流式对话，不经过 Agent graph，不使用任何工具。

    session_id：必填，Python 侧用于维护会话上下文。
    history：可选，[{role, content}] 形式的前置对话；缺省取 Python 内存历史。
    """
    from config import get_settings
    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

    cfg = get_settings()
    llm_kwargs: dict[str, Any] = {"model": cfg.ai_model, "temperature": 0}
    if cfg.ai_base_url:
        llm_kwargs["base_url"] = cfg.ai_base_url
    if cfg.ai_api_key:
        llm_kwargs["api_key"] = cfg.ai_api_key

    llm = ChatOpenAI(**llm_kwargs)

    # 加载历史消息（优先用调用方传入，其次用 Python 内存）
    msgs: list[Any] = []
    if history:
        for h in history:
            role = h.get("role", "user")
            content = h.get("content", "")
            if not content:
                continue
            if role == "system":
                msgs.append(SystemMessage(content=content))
            elif role == "user":
                msgs.append(HumanMessage(content=content))
            elif role == "assistant":
                msgs.append(AIMessage(content=content))
    else:
        mem = get_messages(session_id)
        for m in mem:
            role = m.get("role", "user")
            content = m.get("content", "")
            if not content:
                continue
            if role == "system":
                msgs.append(SystemMessage(content=content))
            elif role == "user":
                msgs.append(HumanMessage(content=content))
            elif role == "assistant":
                msgs.append(AIMessage(content=content))

    # 注入系统提示（仅当历史中没有时）
    if not any(isinstance(m, SystemMessage) for m in msgs):
        msgs.insert(0, SystemMessage(content=cfg.ai_system_prompt))

    # 追加当前用户消息
    msgs.append(HumanMessage(content=user_message))

    try:
        async for chunk in llm.astream(msgs):
            if isinstance(chunk, AIMessage) and chunk.content:
                yield {"type": "text", "content": chunk.content}
            elif hasattr(chunk, "content") and chunk.content:
                yield {"type": "text", "content": chunk.content}

        yield {"type": "done", "session_id": session_id}
    except Exception as e:
        logger.exception("plain chat 异常")
        yield {"type": "error", "message": str(e)}
        yield {"type": "done", "session_id": session_id}
    finally:
        add_message(session_id, "user", user_message)
        logger.info("普通聊天会话 %s 完成", session_id)
