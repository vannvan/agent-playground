# ingest.py —— 批量化建库（文件目录 → 向量库，支持增量）
import hashlib, json
from pathlib import Path

from langchain_community.document_loaders import (
    PyPDFLoader, TextLoader, Docx2txtLoader,
)
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma

DATA_DIR   = Path("data")            # 你的知识库文件放这里
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

def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {}

def main():
    # 中文小模型，离线本地跑，适合桌面客户端；想用在线模型可换 OpenAIEmbeddings
    embedding = HuggingFaceEmbeddings(model_name="BAAI/bge-small-zh-v1.5")
    db = Chroma(persist_directory=DB_DIR, embedding_function=embedding)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", "。", " ", ""],   # 按中文语义边界切
    )
    manifest = load_manifest()

    all_docs, new_files = [], []
    for path in sorted(DATA_DIR.rglob("*")):        # 递归扫描
        if path.is_dir() or path.suffix.lower() not in LOADERS:
            continue
        h = file_hash(path)
        if manifest.get(str(path)) == h:            # 已入库且没变 → 跳过
            continue

        pages = LOADERS[path.suffix.lower()](str(path)).load()
        for d in pages:
            d.metadata["source"] = str(path)        # 保留来源，供引用溯源
        all_docs += splitter.split_documents(pages)
        new_files.append((str(path), h))

    if all_docs:
        db.add_documents(all_docs)                  # 一次批量写入
        for p, h in new_files:
            manifest[p] = h
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        print(f"入库 {len(all_docs)} 个片段，来自 {len(new_files)} 个新增/变更文件")
    else:
        print("无新增文件，跳过本次建库")

if __name__ == "__main__":
    main()