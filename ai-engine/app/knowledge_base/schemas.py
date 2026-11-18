"""Knowledge-base API schemas."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class IngestReq(BaseModel):
    source_dir: Optional[str] = Field(None, description="文档目录；缺省用配置的 DATA_DIR")


class IngestResp(BaseModel):
    documents_added: int
    files_processed: int
    skipped: int
