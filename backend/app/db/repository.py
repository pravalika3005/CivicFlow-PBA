"""Data-access layer.

All database queries live here so the API code never touches SQL directly.
Switching to another database later only requires changing ``make_engine``.
"""
from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db.base import utcnow
from app.db.models import Complaint, StatusUpdate, VideoAnalysis


class ComplaintRepository:
    def __init__(self, session: Session):
        self.session = session

    def create(self, values: dict[str, Any]) -> Complaint:
        complaint = Complaint(**values)
        complaint.status_history.append(
            StatusUpdate(old_status=None, new_status=complaint.status, note="Complaint submitted")
        )
        self.session.add(complaint)
        self.session.commit()
        return self.get(complaint.id)  # type: ignore[return-value]

    def get(self, complaint_id: int) -> Complaint | None:
        stmt = (
            select(Complaint)
            .where(Complaint.id == complaint_id)
            .options(selectinload(Complaint.status_history), selectinload(Complaint.videos))
        )
        return self.session.scalars(stmt).first()

    def list(
        self,
        *,
        search: str | None = None,
        status: str | None = None,
        priority_level: str | None = None,
        category: str | None = None,
        sort: str = "newest",
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[Sequence[Complaint], int]:
        conditions = []
        if search:
            term = search.strip()
            like = f"%{term}%"
            clauses: list[ColumnElement[bool]] = [
                Complaint.title.ilike(like),
                Complaint.description.ilike(like),
                Complaint.location.ilike(like),
            ]
            digits = term.upper().removeprefix("CF-").lstrip("0")
            if digits.isdigit():
                clauses.append(Complaint.id == int(digits))
            conditions.append(or_(*clauses))
        if status:
            conditions.append(Complaint.status == status)
        if priority_level:
            conditions.append(Complaint.priority_level == priority_level)
        if category:
            conditions.append(Complaint.category == category)

        total = self.session.scalar(select(func.count()).select_from(Complaint).where(*conditions)) or 0

        order = (
            [Complaint.priority_score.desc(), Complaint.created_at.desc()]
            if sort == "priority"
            else [Complaint.created_at.desc(), Complaint.id.desc()]
        )
        stmt = select(Complaint).where(*conditions).order_by(*order).limit(limit).offset(offset)
        return self.session.scalars(stmt).all(), total

    def update_status(self, complaint: Complaint, new_status: str, note: str | None) -> Complaint:
        old_status = complaint.status
        complaint.status = new_status
        complaint.updated_at = utcnow()
        complaint.status_history.append(
            StatusUpdate(old_status=old_status, new_status=new_status, note=note)
        )
        self.session.commit()
        return self.get(complaint.id)  # type: ignore[return-value]

    def set_attachment(self, complaint: Complaint, path: str, original_name: str) -> Complaint:
        complaint.attachment_path = path
        complaint.attachment_name = original_name
        complaint.updated_at = utcnow()
        self.session.commit()
        return self.get(complaint.id)  # type: ignore[return-value]

    def dashboard_counts(self) -> dict[str, Any]:
        by_status = dict(
            self.session.execute(
                select(Complaint.status, func.count()).group_by(Complaint.status)
            ).all()
        )
        by_priority = dict(
            self.session.execute(
                select(Complaint.priority_level, func.count()).group_by(Complaint.priority_level)
            ).all()
        )
        by_category = dict(
            self.session.execute(
                select(Complaint.category, func.count()).group_by(Complaint.category)
            ).all()
        )
        return {"by_status": by_status, "by_priority": by_priority, "by_category": by_category}

    def recent(self, limit: int = 5) -> Sequence[Complaint]:
        stmt = select(Complaint).order_by(Complaint.created_at.desc(), Complaint.id.desc()).limit(limit)
        return self.session.scalars(stmt).all()


class VideoRepository:
    def __init__(self, session: Session):
        self.session = session

    def create(self, **values: Any) -> VideoAnalysis:
        video = VideoAnalysis(**values)
        self.session.add(video)
        self.session.commit()
        return video

    def get(self, video_id: int) -> VideoAnalysis | None:
        return self.session.get(VideoAnalysis, video_id)

    def list(self, complaint_id: int | None = None, limit: int = 50) -> Sequence[VideoAnalysis]:
        stmt = select(VideoAnalysis).order_by(VideoAnalysis.id.desc()).limit(limit)
        if complaint_id is not None:
            stmt = stmt.where(VideoAnalysis.complaint_id == complaint_id)
        return self.session.scalars(stmt).all()

    def mark_processing(self, video_id: int) -> None:
        video = self.get(video_id)
        if video:
            video.status = "processing"
            video.progress = 0
            self.session.commit()

    def set_progress(self, video_id: int, progress: int) -> None:
        video = self.get(video_id)
        if video:
            video.progress = max(0, min(99, progress))
            self.session.commit()

    def mark_completed(self, video_id: int, result: dict[str, Any]) -> None:
        video = self.get(video_id)
        if video:
            video.status = "completed"
            video.progress = 100
            video.result = result
            video.error = None
            video.completed_at = utcnow()
            self.session.commit()

    def mark_failed(self, video_id: int, error: str) -> None:
        video = self.get(video_id)
        if video:
            video.status = "failed"
            video.error = error
            video.completed_at = utcnow()
            self.session.commit()
