from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.routes.knowledge_base import get_source_file, resolve_source_file
from app.chat.agent import _format_citations


class CitationTests(unittest.TestCase):
    def test_formats_markers_and_returns_only_cited_sources_in_order(self) -> None:
        sources = [
            {"source": "data/first.md", "content": "first"},
            {"source": "data/second.md", "content": "second"},
            {"source": "data/unused.md", "content": "unused"},
        ]

        text, citations = _format_citations("Answer [2], then [1], [2], [9].", sources)

        self.assertEqual(text, "Answer  ², then  ¹,  ², [9].")
        self.assertEqual(
            citations,
            [
                {**sources[0], "number": 1},
                {**sources[1], "number": 2},
            ],
        )

    def test_source_resolution_only_allows_supported_files_under_data_dir(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "data"
            root.mkdir()
            source = root / "guide.md"
            source.write_text("source")
            outside = root.parent / "outside.txt"
            outside.write_text("outside")
            with patch("app.api.routes.knowledge_base.get_settings", return_value=SimpleNamespace(data_dir=root)):
                self.assertEqual(resolve_source_file(str(source)), source.resolve())
                with self.assertRaises(HTTPException) as error:
                    resolve_source_file(str(outside))
                self.assertEqual(error.exception.status_code, 404)

    def test_source_endpoint_requires_token_and_returns_inline_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "data"
            root.mkdir()
            source = root / "guide.md"
            source.write_text("source")
            settings = SimpleNamespace(data_dir=root, ai_engine_source_token="shared-secret")
            with patch("app.api.routes.knowledge_base.get_settings", return_value=settings):
                with self.assertRaises(HTTPException) as error:
                    asyncio.run(get_source_file(str(source), "wrong-token"))
                self.assertEqual(error.exception.status_code, 403)

                response = asyncio.run(get_source_file(str(source), "shared-secret"))
                self.assertEqual(response.path, source.resolve())
                self.assertTrue(response.headers["content-disposition"].startswith("inline;"))


if __name__ == "__main__":
    unittest.main()
