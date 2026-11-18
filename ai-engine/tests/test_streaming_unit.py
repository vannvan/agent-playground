import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from langchain_core.messages import AIMessage, AIMessageChunk

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.chat import agent


class FakeBoundModel:
    async def astream(self, _messages):
        yield AIMessageChunk(content="Hello ")
        yield AIMessageChunk(content="world")


class FakeModel:
    def __init__(self, **_kwargs):
        pass

    def bind_tools(self, _tools):
        return FakeBoundModel()


class FakeGraph:
    async def astream(self, state, config, stream_mode):
        assert stream_mode == "values"
        queue = config["configurable"]["stream_queue"]
        await queue.put({"type": "text", "content": "Hello "})
        await queue.put({"type": "text", "content": "[1]"})
        yield {
            "messages": state["messages"] + [AIMessage(content="Hello [1]")],
            "sources": [{"source": "docs/example.md", "content": "example"}],
        }


class StreamingUnitTests(unittest.TestCase):
    def test_chat_node_emits_chunks_and_returns_aggregated_message(self):
        async def run():
            queue = asyncio.Queue()
            state = agent.AgentState("test", [AIMessage(content="history")])
            with patch.object(agent, "ChatOpenAI", FakeModel), \
                    patch.object(agent, "get_tools", return_value=[]), \
                    patch.object(agent, "get_settings", return_value=SimpleNamespace(
                        ai_model="test-model",
                        ai_base_url=None,
                        ai_api_key=None,
                        recursion_limit=25,
                    )):
                result = await agent.chat_node(
                    state,
                    {"configurable": {"stream_queue": queue}},
                )

            events = [queue.get_nowait(), queue.get_nowait()]
            self.assertEqual(
                events,
                [
                    {"type": "text", "content": "Hello "},
                    {"type": "text", "content": "world"},
                ],
            )
            self.assertEqual(result["messages"][-1].content, "Hello world")

        asyncio.run(run())

    def test_chat_stream_does_not_repeat_completed_text(self):
        async def rewrite_query(message, _context_questions):
            return message

        async def run():
            config = SimpleNamespace(ai_system_prompt="", recursion_limit=25)
            with patch.object(agent, "get_graph", return_value=FakeGraph()), \
                    patch.object(agent, "get_settings", return_value=config), \
                    patch.object(agent, "add_message"), \
                    patch("app.chat.query_rewriter.rewrite_query", rewrite_query):
                return [
                    event async for event in agent.run_chat_stream(
                        "test-session",
                        "question",
                        history=[],
                    )
                ]

        events = asyncio.run(run())
        self.assertEqual(
            [event["type"] for event in events],
            ["text", "text", "sources", "done"],
        )
        self.assertEqual(
            "".join(event.get("content", "") for event in events if event["type"] == "text"),
            "Hello [1]",
        )
        self.assertEqual(events[2]["citations"][0]["number"], 1)


if __name__ == "__main__":
    unittest.main()
