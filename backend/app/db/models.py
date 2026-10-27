"""Database tables."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime, utcnow


class Complaint(Base):
    __tablename__ = "complaints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), index=True)
    location: Mapped[str] = mapped_column(String(200))
    location_type: Mapped[str] = mapped_column(String(30))
    severity: Mapped[int] = mapped_column(Integer)
    people_affected: Mapped[int] = mapped_column(Integer)
    previous_complaints: Mapped[int] = mapped_column(Integer, default=0)
    near_school: Mapped[bool] = mapped_column(Boolean, default=False)
    near_hospital: Mapped[bool] = mapped_column(Boolean, default=False)
    traffic_level: Mapped[str] = mapped_column(String(10))

    priority_score: Mapped[float] = mapped_column(index=True)
    priority_level: Mapped[str] = mapped_column(String(10), index=True)
    priority_breakdown: Mapped[list] = mapped_column(JSON)

    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)

    attachment_path: Mapped[str | None] = mapped_column(String(400), nullable=True)
    attachment_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    status_history: Mapped[list["StatusUpdate"]] = relationship(
        back_populates="complaint",
        cascade="all, delete-orphan",
        order_by="StatusUpdate.id",
    )
    videos: Mapped[list["VideoAnalysis"]] = relationship(
        back_populates="complaint", order_by="VideoAnalysis.id"
    )

    @property
    def reference(self) -> str:
        return f"CF-{self.id:04d}"

    @property
    def has_attachment(self) -> bool:
        return bool(self.attachment_path)


class StatusUpdate(Base):
    __tablename__ = "status_updates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(
        ForeignKey("complaints.id", ondelete="CASCADE"), index=True
    )
    old_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    new_status: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    complaint: Mapped[Complaint] = relationship(back_populates="status_history")


class VideoAnalysis(Base):
    __tablename__ = "video_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int | None] = mapped_column(
        ForeignKey("complaints.id", ondelete="SET NULL"), nullable=True, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(400))
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer)

    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    complaint: Mapped[Complaint | None] = relationship(back_populates="videos")
