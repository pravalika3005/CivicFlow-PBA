"""Response models for video uploads and analysis."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class VideoAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    complaint_id: int | None
    original_filename: str
    content_type: str | None
    size_bytes: int
    status: str
    progress: int
    result: dict[str, Any] | None
    error: str | None
    created_at: datetime
    completed_at: datetime | None
