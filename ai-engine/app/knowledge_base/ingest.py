# ingest.py —— 批量化建库（文件目录 → 向量库，支持增量）
import hashlib, json
from pathlib import Path

from langchain_community.document_loaders import (
    PyPDFLoader, TextLoader, Docx2txtLoader,
)
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma

from app.core.config import get_settings
from app.knowledge_base.normalize import normalize_document

DATA_DIR   = get_settings().data_dir # 你的知识库文件放这里
DB_DIR     = "vector_db"             # 向量库存这里
MANIFEST   = Path("ingest_manifest.json")  # 记录已处理文件（增量依据）
CHUNK_SIZE, CHUNK_OVERLAP = 500, 50

# 按扩展名分发加载器
LOADERS = {
    ".pdf":  lambda p: PyPDFLoader(p),
    ".txt":  lambda p: TextLoader(p, encoding="utf-8"),
    ".md":   lambda p: TextLoader(p, encoding="utf-8"),
    ".docx": lambda p: Docx2txtLoader(p),
}

def file_hash(p: Path) -> str:
    h = hashlib.md5()
    h.update(p.read_bytes())
    h.update(str(p.stat().st_size).encode())   # 内容+大小共同决定是否变更
    return h.hexdigest()

def load_manifest() -> dict[str, str]:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {}


def save_manifest(manifest: dict[str, str]) -> None:
    temp_path = MANIFEST.with_name(f".{MANIFEST.name}.tmp")
    temp_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    temp_path.replace(MANIFEST)


def chunk_ids(source: str, docs: list[Document]) -> list[str]:
    return [
        hashlib.sha256(f"{source}\0{index}".encode()).hexdigest()
        for index in range(len(docs))
    ]


def source_ids(db: Chroma, source: str) -> list[str]:
    return db.get(where={"source": source}, include=["metadatas"])["ids"]


def replace_changed_sources(
    db: Chroma, docs_by_source: dict[str, list[Document]],
) -> int:
    ids_by_source = {
        source: chunk_ids(source, docs)
        for source, docs in docs_by_source.items()
    }
    all_docs = [
        doc
        for docs in docs_by_source.values()
        for doc in docs
    ]
    all_ids = [
        chunk_id
        for ids in ids_by_source.values()
        for chunk_id in ids
    ]

    if all_docs:
        db.add_documents(all_docs, ids=all_ids)

    for source, ids in ids_by_source.items():
        stale_ids = set(source_ids(db, source)) - set(ids)
        if stale_ids:
            db.delete(ids=sorted(stale_ids))
    return len(all_docs)


def delete_source(db: Chroma, source: str) -> None:
    ids = source_ids(db, source)
    if ids:
        db.delete(ids=ids)


def remove_deleted_sources(
    db: Chroma, manifest: dict[str, str], current_files: set[str],
) -> set[str]:
    removed_files = set(manifest) - current_files
    for source in sorted(removed_files):
        delete_source(db, source)
        manifest.pop(source)
    return removed_files


def ingest_documents():
    if not DATA_DIR.is_dir():
        raise FileNotFoundError(f"知识库目录不存在：{DATA_DIR}")

    # 中文小模型，离线本地跑，适合桌面客户端；想用在线模型可换 OpenAIEmbeddings
    embedding = HuggingFaceEmbeddings(model_name="BAAI/bge-small-zh-v1.5")
    db = Chroma(persist_directory=DB_DIR, embedding_function=embedding)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", "。", " ", ""],   # 按中文语义边界切
    )
    manifest = load_manifest()

    docs_by_source: dict[str, list[Document]] = {}
    new_files: dict[str, str] = {}
    current_files: set[str] = set()
    for path in sorted(DATA_DIR.rglob("*")):        # 递归扫描
        if path.is_dir() or path.suffix.lower() not in LOADERS:
            continue
        source = str(path)
        current_files.add(source)
        h = file_hash(path)
        if manifest.get(source) == h:               # 已入库且没变 → 跳过
            continue

        pages = LOADERS[path.suffix.lower()](str(path)).load()
        for d in pages:
            d.metadata["source"] = source           # 保留来源，供引用溯源

        # 预处理：代码块原样保留，正文 URL 脱敏
        normalized = []
        for d in pages:
            normalized.extend(normalize_document(d))

        # 文本块走切分，代码块直接入库
        text_docs  = [d for d in normalized if d.metadata.get("kind") != "code"]
        code_docs  = [d for d in normalized if d.metadata.get("kind") == "code"]

        if text_docs:
            text_docs = splitter.split_documents(text_docs)
        docs_by_source[source] = text_docs + code_docs
        new_files[source] = h

    removed_files = remove_deleted_sources(db, manifest, current_files)

    if docs_by_source or removed_files:
        chunk_count = replace_changed_sources(db, docs_by_source)
        for source, h in new_files.items():
            manifest[source] = h
        save_manifest(manifest)
        print(f"入库 {chunk_count} 个片段，更新 {len(new_files)} 个文件，删除 {len(removed_files)} 个文件")
    else:
        print("无新增文件，跳过本次建库")
