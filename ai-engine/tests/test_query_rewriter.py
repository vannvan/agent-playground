"""
查询改写测试：验证追问识别与自包含查询生成

覆盖 5 类边界 case：
1. 省略主语追问（"举个实际使用的例子"）
2. 自包含新话题（"Promise 是什么"）
3. 代词指代（"它和普通函数的区别"）
4. 已自包含（"闭包和普通函数的区别"）
5. 极端省略（"为什么"）
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from query_rewriter import rewrite_query


CASES = [
    # (context, question, expect_follow_up, expect_contains)
    (["数组是什么"], "举个实际使用的例子", True, "数组"),
    (["数组是什么"], "Promise 是什么", False, None),
    (["什么是闭包"], "它和普通函数有什么区别", True, "闭包"),
    (["什么是闭包"], "闭包和普通函数的区别", False, None),
    (["数组是什么"], "为什么", True, "数组"),
    ([], "什么是函数", False, None),  # 无上下文，跳过改写
]


async def main() -> int:
    print("╔════════════════════════════════════════════════╗")
    print("║  查询改写测试                                  ║")
    print("╚════════════════════════════════════════════════╝")

    passed = failed = 0
    for i, (ctx, q, expect_fu, expect_contains) in enumerate(CASES, 1):
        result = await rewrite_query(q, ctx)
        status = "?"

        # Validate
        if not ctx:
            ok = (result == q)
            status = "skip(无上下文)"
        elif expect_contains:
            ok = expect_contains in result
            status = f"rewrite → {result!r}"
        else:
            ok = (result == q)
            status = f"unchanged → {result!r}"

        mark = "✅" if ok else "❌"
        if ok:
            passed += 1
        else:
            failed += 1
            print(f"\n  ❌ Case {i}: ctx={ctx} q={q!r}")
            print(f"     期望: {'含' + expect_contains if expect_contains else '不变'}")
            print(f"     实际: {result!r}")

        print(f"  {mark} Case {i}: ctx={ctx} | q={q!r} | {status}")

    print(f"\n总计: {passed+failed} | ✅ {passed} | ❌ {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
