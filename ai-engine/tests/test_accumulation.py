"""
测试：skill 模式连续调用时答案不应累加

触发条件：同一 chatId 下连续发送多条 skill 消息，
每轮 history 会从 DB 加载全部过往对话，
若处理不当，LLM 会将之前答案复述进新一轮回复中。
"""
from __future__ import annotations
import asyncio
import json
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from agent import run_chat_stream

KB_PROMPT = (
    "你是基于内部知识库回答的助手。\n"
    "你必须先调用 search_knowledge_base 工具检索知识库相关内容，"
    "只有当检索结果足够时，才整合检索片段回答问题；禁止直接凭训练数据作答。\n"
    "若搜索结果为空（status=no_relevant_result），回复："
    "知识库中没有找到与相关问题相关的信息。\n"
    "【重要】不要复述或引用之前的对话内容，只针对当前问题作答。"
)


async def collect(async_gen):
    return [e async for e in async_gen]


def extract_text(events):
    return "".join(e["content"] for e in events if e.get("type") == "text" and e.get("content"))


# ── TC-A1: 三轮连续调用，后两轮不应包含前一轮答案开头 ─────────────────────────
async def test_no_answer_accumulation() -> None:
    sid = f"accum-{uuid.uuid4().hex[:6]}"
    print(f"\n{'='*55}")
    print(f"TC-A1: 三轮连续调用 → 答案不应累加 (session={sid})")
    print(f"{'='*55}")

    histories: list[list[dict]] = [[]]  # each round appends to this

    answers: list[str] = []
    for i, question in enumerate(["什么是函数？", "函数的定义是什么？", "函数的作用是什么？"], 1):
        hist = histories[i - 1]
        t0 = time.time()
        events = await collect(run_chat_stream(sid, question, system_prompt=KB_PROMPT, history=hist))
        elapsed = time.time() - t0
        ans = extract_text(events)
        answers.append(ans)
        kb_calls = sum(1 for e in events if e.get("type") == "tool" and e.get("name") == "search_knowledge_base")
        errors = [e for e in events if e.get("type") == "error"]
        no_recursion = not any("Recursion" in str(e.get("message", "")) for e in errors)
        print(f"\n  Round {i} ({elapsed:.1f}s): kb_calls={kb_calls}, text_len={len(ans)}, no_recursion={no_recursion}")
        print(f"  Answer[{i}] preview: {ans[:80]!r}")
        # Build history for next round — simulate Node's fixed behavior:
        # Node passes ONLY recent user messages (no assistant replies) to Python
        next_users = [h["content"] for h in hist if h["role"] == "user"] + [question]
        histories.append([{"role": "user", "content": q} for q in next_users[-2:]])

    # 断言：Round 2/3 的答案不能以 Round 1/2 答案的开头起头
    for i in range(1, len(answers)):
        prev = answers[i - 1].strip()
        curr = answers[i].strip()
        # 如果前一回答有实质内容，当前回答不应以其开头
        if len(prev) > 30:
            prefix_len = min(40, len(prev))
            matches = curr.startswith(prev[:prefix_len])
            print(f"\n  Round {i+1} starts with Round {i}? {matches}")
            assert not matches, (
                f"BUG: Round {i+1} 答案开头重复了 Round {i} 的内容！\n"
                f"  Round{i} start: {prev[:60]!r}\n"
                f"  Round{i+1} start: {curr[:60]!r}"
            )

    print("\n✅ TC-A1 通过：答案无累加")


# ── TC-A2: 空搜索结果不污染后续轮次 ───────────────────────────────────────────
async def test_empty_search_no_pollution() -> None:
    sid = f"accum-empty-{uuid.uuid4().hex[:6]}"
    print(f"\n{'='*55}")
    print(f"TC-A2: 空搜索后继续调用 → 不引入历史污染")
    print(f"{'='*55}")

    # 第一轮：查一个肯定不存在的主题
    events1 = await collect(run_chat_stream(
        sid, "量子纠缠在金融衍生品定价中有哪些应用？",
        system_prompt=KB_PROMPT, history=[]
    ))
    ans1 = extract_text(events1)
    print(f"\n  Round 1: {ans1[:120]!r}")
    assert "没有找" in ans1 or "未找到" in ans1 or "没有相关" in ans1, \
        f"应返回'未找到'提示，实际: {ans1[:100]}"

    # 第二轮：正常问题，history 包含第一轮的"未找到"回复
    events2 = await collect(run_chat_stream(
        sid, "解释一下什么是回调函数？",
        system_prompt=KB_PROMPT,
        history=[
            {"role": "user", "content": "量子纠缠在金融衍生品定价中有哪些应用？"},
            {"role": "assistant", "content": ans1},
        ]
    ))
    ans2 = extract_text(events2)
    print(f"  Round 2: {ans2[:120]!r}")
    # Round 2 应该讨论的是"回调函数"，而不是重复"量子纠缠"
    assert "量子纠缠" not in ans2, \
        f"BUG: Round 2 意外包含了上一轮无关主题！内容: {ans2[:200]}"
    assert "回调" in ans2 or "函数" in ans2, \
        f"Round 2 应讨论回调函数，实际: {ans2[:100]}"
    print("\n✅ TC-A2 通过：空搜索不污染后续轮次")


async def main() -> int:
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║     TC-A: 答案累加专项测试                               ║")
    print("╚══════════════════════════════════════════════════════════╝")
    try:
        from retriever import collection_count
        print(f"[前置] 知识库文档数: {collection_count()}")
    except Exception as e:
        print(f"[警告] 无法连接知识库: {e}")

    passed = failed = 0
    cases = [test_no_answer_accumulation, test_empty_search_no_pollution]
    for fn in cases:
        try:
            await fn()
            passed += 1
        except Exception as e:
            failed += 1
            print(f"\n❌ {fn.__name__}: {e}")

    print(f"\n总计: {passed + failed} | ✅ {passed} | ❌ {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
