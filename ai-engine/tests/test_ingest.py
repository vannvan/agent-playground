from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langchain_core.documents import Document

from ingest import (
    remove_deleted_sources,
    replace_changed_sources,
    save_manifest,
)


class FakeChroma:
    def __init__(self) -> None:
        self.documents: dict[str, Document] = {}

    def add_documents(self, documents: list[Document], ids: list[str]) -> None:
        self.documents.update(zip(ids, documents))

    def get(self, where: dict, include: list[str]) -> dict[str, list]:
        source = where["source"]
        ids = [
            doc_id for doc_id, doc in self.documents.items()
            if doc.metadata.get("source") == source
        ]
        return {"ids": ids}

    def delete(self, ids: list[str]) -> None:
        for doc_id in ids:
            self.documents.pop(doc_id, None)


def document(source: str, content: str) -> Document:
    return Document(page_content=content, metadata={"source": source, "kind": "text"})


class IngestTests(unittest.TestCase):
    def test_changed_source_overwrites_chunks_and_removes_stale_chunks(self) -> None:
        db = FakeChroma()
        source = "data/guide.txt"

        replace_changed_sources(
            db, {source: [document(source, "old chunk 1"), document(source, "old chunk 2")]}
        )
        replace_changed_sources(db, {source: [document(source, "updated chunk")]})

        self.assertEqual(len(db.documents), 1)
        self.assertEqual(
            next(iter(db.documents.values())).page_content,
            "updated chunk",
        )

    def test_retries_upsert_same_chunk_ids_without_duplicates(self) -> None:
        db = FakeChroma()
        source = "data/guide.txt"
        docs = [document(source, "chunk")]

        replace_changed_sources(db, {source: docs})
        replace_changed_sources(db, {source: docs})

        self.assertEqual(len(db.documents), 1)

    def test_empty_changed_source_removes_all_old_chunks(self) -> None:
        db = FakeChroma()
        source = "data/empty.txt"
        replace_changed_sources(
            db, {source: [document(source, "old chunk")]}
        )

        replace_changed_sources(db, {source: []})

        self.assertEqual(db.documents, {})

    def test_deleted_source_is_removed_from_vector_store_and_manifest(self) -> None:
        db = FakeChroma()
        removed = "data/removed.txt"
        retained = "data/retained.txt"
        replace_changed_sources(
            db,
            {
                removed: [document(removed, "remove me")],
                retained: [document(retained, "keep me")],
            },
        )
        manifest = {removed: "old-hash", retained: "current-hash"}

        removed_files = remove_deleted_sources(db, manifest, {retained})

        self.assertEqual(removed_files, {removed})
        self.assertEqual(set(manifest), {retained})
        self.assertEqual(
            [doc.page_content for doc in db.documents.values()],
            ["keep me"],
        )

    def test_manifest_is_written_and_replaced(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest_path = Path(directory) / "ingest_manifest.json"
            with patch("ingest.MANIFEST", manifest_path):
                save_manifest({"data/guide.txt": "hash"})

            self.assertEqual(
                json.loads(manifest_path.read_text()),
                {"data/guide.txt": "hash"},
            )
            self.assertFalse(manifest_path.with_name(".ingest_manifest.json.tmp").exists())


if __name__ == "__main__":
    unittest.main()
