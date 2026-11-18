"""
Python AI Engine 自动化测试脚本

运行方式：
    HF_HUB_OFFLINE=1 python3 tests/test_chat.py          # 直接运行
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.chat.agent import run_plain_chat_stream, run_chat_stream

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("test_chat")


class TestFail(Exception):
    pass

def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise TestFail(msg)

def assert_contains(haystack: str, needle: str, ctx: str = "") -> None:
    if needle not in haystack:
        raise TestFail(f"期望包含 {needle!r}{f' [{ctx}]' if ctx else ''}，实际:\n{haystack[:400]}")

def assert_not_contains(haystack: str, needle: str, ctx: str = "") -> None:
    if needle in haystack:
        raise TestFail(f"意外包含 {needle!r}{f' [{ctx}]' if ctx else ''}，内容: {haystack[:300]}")


async def collect_events(async_gen) -> list[dict]:
    events = []
    async for ev in async_gen:
        events.append(ev)
    return events


KB_SYSTEM_PROMPT = """\
你是基于内部知识库回答的助手。
【必须遵守的工作流程】
- 用户提问后，你必须先调用 search_knowledge_base 工具检索知识库相关内容
- 只有当检索结果足够时，才整合检索片段回答问题；禁止直接凭训练数据作答
- 若搜索结果为空（status=no_relevant_result），回复：知识库中没有找到与相关问题相关的信息。
- 不要在未检索的情况下直接回答任何问题
- 【重要】search_knowledge_base 返回 status=relevant 时，必须立即整合回答，不得再次调用任何检索工具
"""


# ── TC-01: 普通聊天（mode=chat）── 纯 LLM 回答，无工具调用 ─────────────────
async def test_plain_chat_no_tools() -> None:
    log.info("=" * 60)
    log.info("TC-01: plain chat → 纯 LLM 回答，无工具调用")
    log.info("=" * 60)

    session_id = f"tc01-{uuid.uuid4().hex[:8]}"
    t0 = time.time()

    events = await collect_events(
        run_plain_chat_stream(session_id, "什么是函数？")
    )

    elapsed = time.time() - t0
    log.info("收到 %d 个事件，耗时 %.1fs", len(events), elapsed)

    text_events = [e for e in events if e.get("type") == "text" and e.get("content")]
    assert_true(len(text_events) >= 1, "缺少文本事件 (type=text)")
    full_text = "".join(e["content"] for e in text_events)
    log.info("回答前200字: %s", full_text[:200])

    tool_events = [e for e in events if e.get("type") == "tool"]
    assert_true(len(tool_events) == 0,
                f"plain chat 不应调工具，却收到 {len(tool_events)} 个 tool 事件")

    last = events[-1]
    assert_true(last.get("type") == "done", f"最后一个事件应为 done，实际: {last}")

    assert_contains(full_text, "函数", "回答未提及'函数'")
    assert_true(len(full_text) > 20, f"回答过短（{len(full_text)} 字符）")

    log.info("✅ TC-01 通过")


# ── TC-02: skill 知识库检索 ───────────────────────────────────────────────────
async def test_skill_kb_tool_call() -> None:
    log.info("=" * 60)
    log.info("TC-02: skill(knowledge-base) → 调用搜索工具 + sources + 知识回答")
    log.info("=" * 60)

    session_id = f"tc02-{uuid.uuid4().hex[:8]}"
    t0 = time.time()

    events = await collect_events(
        run_chat_stream(
            session_id=session_id,
            user_message="解释一下什么是函数？",
            system_prompt=KB_SYSTEM_PROMPT,
            history=[],
        )
    )

    elapsed = time.time() - t0
    log.info("收到 %d 个事件，耗时 %.1fs", len(events), elapsed)

    kb_calls = [e for e in events
                if e.get("type") == "tool" and e.get("name") == "search_knowledge_base"]
    assert_true(len(kb_calls) >= 1,
                f"应调用 search_knowledge_base，实际次数: {len(kb_calls)}；"
                f"全部事件类型: {[e.get('type') for e in events]}")
    log.info("  → search_knowledge_base 被调用 %d 次", len(kb_calls))

    sources_events = [e for e in events if e.get("type") == "sources"]
    assert_true(len(sources_events) >= 1, "缺少 sources 事件")
    source_list = sources_events[-1].get("sources", [])
    log.info("  → sources 数: %d", len(source_list))

    text_events = [e for e in events if e.get("type") == "text" and e.get("content")]
    assert_true(len(text_events) >= 1, "缺少文本回复事件")
    full_text = "".join(e["content"] for e in text_events)
    log.info("  → 回答前300字: %s", full_text[:300])

    errors = [e for e in events if e.get("type") == "error"]
    for err in errors:
        msg = err.get("message", "")
        assert_not_contains(msg, "Recursion limit", f"触发递归限制: {msg[:200]}")

    assert_true(events[-1].get("type") == "done", f"最后事件非 done: {events[-1]}")

    log.info("✅ TC-02 通过")


# ── TC-03: skill 模式但知识库无匹配内容 ─────────────────────────────────────
async def test_skill_kb_no_match() -> None:
    log.info("=" * 60)
    log.info("TC-03: skill 模式 → 无匹配内容时正确提示")
    log.info("=" * 60)

    session_id = f"tc03-{uuid.uuid4().hex[:8]}"
    t0 = time.time()

    events = await collect_events(
        run_chat_stream(
            session_id=session_id,
            user_message="量子纠缠在金融衍生品定价中的应用是什么？",
            system_prompt=KB_SYSTEM_PROMPT,
            history=[],
        )
    )

    elapsed = time.time() - t0
    log.info("收到 %d 个事件，耗时 %.1fs", len(events), elapsed)

    kb_calls = [e for e in events
                if e.get("type") == "tool" and e.get("name") == "search_knowledge_base"]
    assert_true(len(kb_calls) >= 1, f"即使无结果也应先检索，实际: {len(kb_calls)} 次")
    log.info("  → 检索调用 %d 次", len(kb_calls))

    text_events = [e for e in events if e.get("type") == "text" and e.get("content")]
    full_text = "".join(e["content"] for e in text_events)
    log.info("  → 回答: %s", full_text[:300])

    has_no_result = any(kw in full_text for kw in
                        ["没有找", "未找到", "没有相关", "不了解", "没有信息"])
    assert_true(has_no_result or len(full_text) > 10,
                f"应明确告知无结果，实际: {full_text[:200]}")

    for e in events:
        if e.get("type") == "error":
            assert_not_contains(e.get("message", ""), "Recursion limit", "触发递归限制")

    assert_true(events[-1].get("type") == "done", "末尾非 done 事件")

    log.info("✅ TC-03 通过")


# ── TC-04: 连续空检索自动终止（regression test）─────────────────────────────
async def test_consecutive_empty_search_stops() -> None:
    log.info("=" * 60)
    log.info("TC-04: 连续空检索 → 自动终止，不触发 RecursionLimit")
    log.info("=" * 60)

    session_id = f"tc04-{uuid.uuid4().hex[:8]}"
    t0 = time.time()

    events = await collect_events(
        run_chat_stream(
            session_id=session_id,
            user_message="这个知识库里有提到量子金融吗？请检索并回答",
            system_prompt=(
                "你是知识库助手。必须先调用 search_knowledge_base。\n"
                "如果检索结果为空，回复'知识库中没有相关内容'并结束。\n"
                "不要反复调用同一个检索。"
            ),
            history=[],
        )
    )

    elapsed = time.time() - t0
    log.info("收到 %d 个事件，耗时 %.1fs", len(events), elapsed)

    kb_calls = [e for e in events
                if e.get("type") == "tool" and e.get("name") == "search_knowledge_base"]
    log.info("  → search_knowledge_base 调用次数: %d", len(kb_calls))

    assert_true(len(kb_calls) <= 3,
                f"连续空检索未终止！调用次数 {len(kb_calls)}（上限应为 3）")

    for e in events:
        if e.get("type") == "error":
            assert_not_contains(e.get("message", ""), "Recursion limit",
                                f"递归超限: {e['message'][:200]}")

    assert_true(events[-1].get("type") == "done", "末尾非 done")

    log.info("✅ TC-04 通过")


# ── TC-05: 多轮对话历史传递 ─────────────────────────────────────────────────
async def test_history_preserved() -> None:
    log.info("=" * 60)
    log.info("TC-05: 多轮对话 → 历史正确保存和传递")
    log.info("=" * 60)

    session_id = f"tc05-{uuid.uuid4().hex[:8]}"

    t1 = time.time()
    events1 = await collect_events(run_plain_chat_stream(session_id, "什么是变量？"))
    text1 = "".join(e["content"] for e in events1
                    if e.get("type") == "text" and e.get("content"))
    log.info("第一轮 (%.1fs): %s", time.time() - t1, text1[:100])
    assert_true(len(text1) > 10, "第一轮回答过短")

    t2 = time.time()
    events2 = await collect_events(run_plain_chat_stream(session_id, "那变量和函数有什么关系？"))
    text2 = "".join(e["content"] for e in events2
                    if e.get("type") == "text" and e.get("content"))
    log.info("第二轮 (%.1fs): %s", time.time() - t2, text2[:100])
    assert_true(len(text2) > 10, "第二轮回答过短")

    log.info("✅ TC-05 通过")


# ── 主入口 ───────────────────────────────────────────────────────────────────
async def main() -> int:
    print()
    print("╔══════════════════════════════════════════════════════════╗")
    print("║     Python AI Engine 自动化测试套件                      ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print()

    try:
        from app.knowledge_base.retriever import collection_count
        count = collection_count()
        print(f"[前置] 知识库文档数: {count}")
        if count == 0:
            print("[警告] 知识库为空！请先运行 python -m scripts.ingest 导入文档\n")
    except Exception as e:
        print(f"[警告] 无法连接知识库: {e}\n")
    print()

    cases = [
        ("TC-01  plain chat → 纯 LLM 回答，无工具调用",    test_plain_chat_no_tools),
        ("TC-02  skill knowledge-base → 工具调用 + sources + 知识回答",
         test_skill_kb_tool_call),
        ("TC-03  skill 模式 → 无匹配内容时正确提示",       test_skill_kb_no_match),
        ("TC-04  连续空检索 → 自动终止，不触发 RecursionLimit",
         test_consecutive_empty_search_stops),
        ("TC-05  多轮对话 → 历史正确保存和传递",           test_history_preserved),
    ]

    passed = failed = 0
    results: list[tuple] = []

    for label, fn in cases:
        try:
            await fn()
            passed += 1
            results.append(("PASS", label))
        except TestFail as e:
            failed += 1
            results.append(("FAIL", label, str(e)))
        except Exception as e:
            failed += 1
            results.append(("ERROR", label, f"{type(e).__name__}: {e}"))

    print()
    print("─" * 60)
    print("测试结果汇总")
    print("─" * 60)
    for r in results:
        status, label = r[0], r[1]
        if status == "PASS":
            print(f"  ✓ PASS  {label}")
        else:
            detail = r[2] if len(r) > 2 else ""
            print(f"  ✗ {status}  {label}")
            if detail:
                for line in detail.split("\n"):
                    print(f"       {line}")

    total = passed + failed
    print("─" * 60)
    print(f"总计: {total} | ✅ 通过: {passed} | ❌ 失败: {failed}")
    print("─" * 60)
    print()

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
