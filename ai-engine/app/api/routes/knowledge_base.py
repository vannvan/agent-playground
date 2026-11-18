import logging
import mimetypes
import secrets
from collections import Counter
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.knowledge_base.schemas import IngestReq, IngestResp
from app.knowledge_base.retriever import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


def resolve_source_file(source: str) -> Path:
    data_root = get_settings().data_dir.resolve()
    try:
        source_path = Path(source).resolve(strict=True)
    except (OSError, RuntimeError, ValueError):
        raise HTTPException(status_code=404, detail="来源文件不存在")
    if (
        not source_path.is_relative_to(data_root)
        or not source_path.is_file()
        or source_path.suffix.lower() not in {".pdf", ".txt", ".md", ".docx"}
    ):
        raise HTTPException(status_code=404, detail="来源文件不存在")
    return source_path


@router.get("/sources/file", include_in_schema=False)
async def get_source_file(
    source: str,
    source_token: Optional[str] = Header(default=None, alias="X-AI-Engine-Source-Token"),
):
    expected_token = get_settings().ai_engine_source_token
    if not expected_token:
        raise HTTPException(status_code=503, detail="原文访问服务未配置")
    if not secrets.compare_digest(source_token or "", expected_token):
        raise HTTPException(status_code=403, detail="无权访问来源文件")

    source_path = resolve_source_file(source)
    return FileResponse(
        source_path,
        filename=source_path.name,
        media_type=mimetypes.guess_type(source_path.name)[0] or "application/octet-stream",
        content_disposition_type="inline",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


_TOPIC_QUESTIONS: dict[str, list[str]] = {
    "模块化": ["模块是怎么导出和导入的？", "AMD 和 CommonJS 有什么区别？"],
    "Promise": ["Promise 的链式调用怎么处理错误？", "async/await 和 Promise 有什么区别？"],
    "async,await": ["async/await 的运行原理是什么？", "如何处理并发异步请求？"],
    "ECMAScript6概要": ["ES6 有哪些新特性？", "箭头函数和普通函数有什么区别？"],
    "函数": ["闭包是怎么工作的？", "如何理解 this 的指向？"],
    "对象、函数、原型": ["原型链是怎么工作的？", "如何实现继承？"],
    "数据类型": ["JavaScript 有哪些基本类型？", "类型转换的规则是什么？"],
    "网络请求": ["fetch API 怎么使用？", "如何处理请求超时和重试？"],
    "文档-事件-接口": ["DOM 事件委托是什么？", "如何高效操作 DOM？"],
    "异步": ["事件循环是怎么工作的？", "宏任务和微任务有什么区别？"],
}
_FALLBACK_QUESTIONS = [
    "这个知识库主要包含哪些内容？",
    "如何处理超时重试？",
    "代码里的 fetch 怎么写？",
    "部署流程是什么？",
]


@router.get("/suggestions", tags=["suggestions"])
async def suggestions():
    """根据知识库文档主题返回推荐问题列表。"""
    try:
        db = get_db()
        info = db.get(include=["metadatas"])
        sources = [metadata.get("source", "") for metadata in (info.get("metadatas") or []) if metadata]
        files = Counter(
            source.split("/")[-1].replace(".md", "").replace(".txt", "").replace(".pdf", "")
            for source in sources
        )

        questions: list[str] = []
        seen_topics: set[str] = set()
        for filename, _ in files.most_common(8):
            matched = False
            for topic, topic_questions in _TOPIC_QUESTIONS.items():
                if topic in filename and topic not in seen_topics:
                    seen_topics.add(topic)
                    questions.extend(topic_questions[:2])
                    matched = True
                    break
            if matched and len(questions) >= 6:
                break

        if len(questions) < 4:
            for question in _FALLBACK_QUESTIONS:
                if question not in questions:
                    questions.append(question)
                if len(questions) >= 6:
                    break

        return {"questions": questions[:6]}
    except Exception as error:
        logger.warning("获取建议问题失败：%s", error)
        return {"questions": list(_FALLBACK_QUESTIONS)}


@router.post("/ingest", response_model=IngestResp, tags=["ingest"])
async def ingest(req: Optional[IngestReq] = None):
    from app.knowledge_base.ingest import ingest_documents

    try:
        ingest_documents()
        return IngestResp(documents_added=0, files_processed=0, skipped=0)
    except Exception as error:
        logger.exception("文档入库失败")
        raise HTTPException(status_code=500, detail=f"入库失败: {error}")
