"""
E2E 累加测试：模拟用户在同一 chatId 下连续发 3 条 skill 消息

复现路径：front-web → Node /api/chat → Python /chat/stream
检查每轮 Python 返回的 text 是否只包含当前轮的答案（不含前几轮内容）
"""
from __future__ import annotations
import asyncio
import json
import sys
import time
import uuid
import httpx
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

PY_URL = "http://127.0.0.1:8000"
NODE_URL = "http://127.0.0.1:3000"

KB_PROMPT = (
    "你是基于内部知识库回答的助手。\n"
    "你必须先调用 search_knowledge_base 工具检索知识库相关内容，"
    "只有当检索结果足够时，才整合检索片段回答问题；禁止直接凭训练数据作答。\n"
    "若搜索结果为空（status=no_relevant_result），回复："
    "知识库中没有找到与相关问题相关的信息。\n"
    "【重要】不要复述或引用之前的对话内容，只针对当前问题作答。"
)

QUESTIONS = ["什么是函数？", "函数的定义是什么？", "函数的作用是什么？"]


async def call_python_stream(session_id: str, message: str, history: list) -> tuple[str, list]:
    """直接调 Python /chat/stream，返回 (full_text, events)"""
    events = []
    text = ""
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", f"{PY_URL}/chat/stream", json={
            "message": message,
            "session_id": session_id,
            "system_prompt": KB_PROMPT,
            "history": history,
        }) as resp:
            buffer = ""
            async for chunk in resp.aiter_text():
                buffer += chunk
                while "\n\n" in buffer:
                    part, buffer = buffer.split("\n\n", 1)
                    part = part.strip()
                    if not part.startswith("data:"):
                        continue
                    try:
                        ev = json.loads(part[5:].strip())
                        events.append(ev)
                        if ev.get("type") == "text":
                            text += ev.get("content", "")
                    except json.JSONDecodeError:
                        pass
    return text, events


async def test_python_level_accumulation():
    """直接在 Python 层验证：使用 Node 修复后的 history 格式（仅 user 消息）"""
    print("\n" + "="*60)
    print("TC-E2E-1: Python 层 — 模拟 Node 修复后的 history（仅 user）")
    print("="*60)

    sid = f"e2e-py-{uuid.uuid4().hex[:6]}"
    answers: list[str] = []
    user_history: list[dict] = []  # Node passes only user messages

    for i, q in enumerate(QUESTIONS, 1):
        t0 = time.time()
        text, events = await call_python_stream(sid, q, user_history)
        elapsed = time.time() - t0
        kb_calls = sum(1 for e in events if e.get("type") == "tool" and e.get("name") == "search_knowledge_base")
        errors = [e for e in events if e.get("type") == "error"]
        no_rec = not any("Recursion" in str(e.get("message", "")) for e in errors)
        print(f"\n  R{i} ({elapsed:.1f}s): kb={kb_calls} len={len(text)} no_recursion={no_rec}")
        print(f"  Answer[{i}]: {text[:80]!r}")

        # Check: answer should NOT start with any previous answer
        for j, prev in enumerate(answers):
            if len(prev) > 30 and text.strip().startswith(prev.strip()[:40]):
                print(f"  ❌ BUG: R{i} 开头重复了 R{j+1}!")
                raise AssertionError(f"R{i} 累加了 R{j+1} 的内容")

        answers.append(text)
        # Node fix: pass only user messages (last 2)
        user_history.append({"role": "user", "content": q})
        user_history = user_history[-2:]

    print("\n✅ TC-E2E-1 通过：Python 层无累加")


async def test_python_with_full_history():
    """验证 BUG 场景：如果传了含 assistant 的全量 history（旧 Node 行为），会累加"""
    print("\n" + "="*60)
    print("TC-E2E-2: Python 层 — 全量 history（含 assistant），预期累加")
    print("="*60)
    print("  （此用例验证 BUG 存在性，不作为修复验收标准）")

    sid = f"e2e-full-{uuid.uuid4().hex[:6]}"
    full_history: list[dict] = []
    answers: list[str] = []

    for i, q in enumerate(QUESTIONS[:2], 1):  # 只测 2 轮，节省配额
        text, events = await call_python_stream(sid, q, full_history)
        print(f"\n  R{i}: len={len(text)}")
        answers.append(text)
        full_history += [
            {"role": "user", "content": q},
            {"role": "assistant", "content": text},
        ]

    if len(answers) >= 2 and len(answers[0]) > 30:
        does_repeat = answers[1].strip().startswith(answers[0].strip()[:40])
        print(f"\n  R2 starts with R1? {does_repeat}")
        if does_repeat:
            print("  ⚠️  BUG 确认：全量 history 会导致累加（Node 修复已避免此场景）")
        else:
            print("  ✅ 即使全量 history 也无累加（可能是 LLM 行为差异）")


async def main():
    print("╔══════════════════════════════════════════════════════════╗")
    print("║     E2E 累加专项测试                                     ║")
    print("╚══════════════════════════════════════════════════════════╝")

    # Health check
    import urllib.request, json as _json
    with urllib.request.urlopen(f"{PY_URL}/health", timeout=5) as resp:
        data = _json.loads(resp.read())
        print(f"\n[前置] Python: {data['model']}")

    passed = failed = 0
    for fn in [test_python_level_accumulation, test_python_with_full_history]:
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
