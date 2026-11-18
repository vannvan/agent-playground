"""
累加 Bug 修复验证

根因：run_chat_stream 中 last_processed_count 从 0 开始，
stream_mode="values" 首帧包含完整初始 state（含 history AIMessage），
导致历史 AI 回复被重复加入 all_texts，最终答案 = 旧答案 + 新答案。

修复：last_processed_count = len(msgs)，跳过所有初始消息。
"""
import asyncio, json, sys, time, uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.chat.agent import run_chat_stream

KB_PROMPT = (
    "你是基于内部知识库回答的助手。\n"
    "你必须先调用 search_knowledge_base 检索后才能回答。\n"
    "若结果为空回复：知识库中没有找到与相关问题相关的信息。\n"
    "【重要】不要复述或引用之前的对话内容，只针对当前问题作答。"
)

async def collect(gen):
    return [e async for e in gen]

def text_of(events):
    return "".join(e.get("content","") for e in events if e.get("type")=="text" and e.get("content"))

async def test_no_accumulation_with_assistant_history():
    """模拟 Node 传入含 assistant 回复的完整 history（旧场景），验证修复后不累加"""
    print("\n" + "="*60)
    print("TC-FIX-1: 含 assistant 的全量 history → 不应累加")
    print("="*60)

    sid = f"fix-{uuid.uuid4().hex[:6]}"
    # 模拟 DB 中的完整历史（含 assistant 回复）
    history = [
        {"role": "user", "content": "解释一下数组"},
        {"role": "assistant", "content": "数组本质上是一种特殊的对象，在 JavaScript 里用 typeof 检测数组会返回 object。JS 用一个 32 位整数来保存数组的元素个数。"},
    ]
    q = "解释一下Map和WeakMap"

    events = await collect(run_chat_stream(sid, q, system_prompt=KB_PROMPT, history=history))
    ans = text_of(events)
    print(f"\n  Question: {q}")
    print(f"  Answer ({len(ans)} chars): {ans[:150]!r}")

    # 修复验证：答案不应以历史 assistant 内容开头
    prev_ans = history[1]["content"]
    starts_with_prev = ans.strip().startswith(prev_ans.strip()[:40])
    print(f"  Starts with prev answer? {starts_with_prev}")

    # 应该讨论 Map/WeakMap，而不是重复数组内容
    discusses_map = "Map" in ans or "WeakMap" in ans
    print(f"  Discusses Map/WeakMap? {discusses_map}")

    assert not starts_with_prev, f"❌ BUG STILL EXISTS: R 答案开头 = 上一轮数组答案开头！"
    print("\n  ✅ 通过：无累加")

async def test_multi_turn_no_accumulation():
    """连续 3 轮，每轮传完整 history，验证每轮答案独立"""
    print("\n" + "="*60)
    print("TC-FIX-2: 3 轮连续调用（每轮含完整 history）→ 每轮答案独立")
    print("="*60)

    sid = f"fix-multi-{uuid.uuid4().hex[:6]}"
    questions = ["什么是函数？", "什么是闭包？", "什么是原型链？"]
    full_history = []
    answers = []

    for i, q in enumerate(questions, 1):
        events = await collect(run_chat_stream(sid, q, system_prompt=KB_PROMPT, history=full_history))
        ans = text_of(events)
        answers.append(ans)
        kb = sum(1 for e in events if e.get("type")=="tool" and e.get("name")=="search_knowledge_base")
        print(f"\n  R{i}: kb={kb} len={len(ans)}")
        print(f"  Answer: {ans[:100]!r}")

        # Check: not starting with any previous answer
        for j, prev in enumerate(answers[:-1]):
            if len(prev) > 30:
                repeats = ans.strip().startswith(prev.strip()[:40])
                if repeats:
                    print(f"  ❌ BUG: R{i} 开头重复 R{j+1}!")
                    raise AssertionError(f"R{i} 累加了 R{j+1}")

        # Simulate Node saving to DB and passing full history next time
        full_history += [{"role":"user","content":q},{"role":"assistant","content":ans}]

    print("\n  ✅ 通过：3 轮答案无累加")

async def main():
    print("╔══════════════════════════════════════════════════════════╗")
    print("║     累加 Bug 修复验证                                    ║")
    print("╚══════════════════════════════════════════════════════════╝")
    passed = failed = 0
    for fn in [test_no_accumulation_with_assistant_history, test_multi_turn_no_accumulation]:
        try:
            await fn()
            passed += 1
        except Exception as e:
            failed += 1
            print(f"\n❌ {fn.__name__}: {e}")
    print(f"\n{'─'*60}")
    print(f"总计: {passed+failed} | ✅ {passed} | ❌ {failed}")
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
