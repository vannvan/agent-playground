"""Run the local knowledge-base ingestion job from the ai-engine directory."""

from app.knowledge_base.ingest import ingest_documents


if __name__ == "__main__":
    ingest_documents()
