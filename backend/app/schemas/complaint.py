"""Request and response models for complaints."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.core.enums import Category, ComplaintStatus, LocationType, TrafficLevel
from app.schemas.video import VideoAnalysisOut


class ComplaintCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=2000)
    category: Category
    location: str = Field(min_length=3, max_length=200)
    location_type: LocationType = LocationType.other
    severity: int = Field(ge=1, le=5, description="1 = minor, 5 = severe")
    people_affected: int = Field(ge=0, le=1_000_000)
    previous_complaints: int = Field(default=0, ge=0, le=1000)
    near_school: bool = False
    near_hospital: bool = False
    traffic_level: TrafficLevel = TrafficLevel.low


class PriorityPreviewRequest(BaseModel):
    """Inputs the priority engine uses (no title/description needed)."""

    model_config = ConfigDict(extra="forbid")

    severity: int = Field(ge=1, le=5)
    people_affected: int = Field(default=0, ge=0, le=1_000_000)
    previous_complaints: int = Field(default=0, ge=0, le=1000)
    near_school: bool = False
    near_hospital: bool = False
    traffic_level: TrafficLevel = TrafficLevel.low
    location_type: LocationType = LocationType.other


class PriorityFactorOut(BaseModel):
    factor: str
    label: str
    input_value: str
    points: float
    max_points: float
    note: str
    defaulted: bool = False


class PriorityOut(BaseModel):
    score: float
    level: str
    max_score: float
    breakdown: list[PriorityFactorOut]


class StatusUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    status: ComplaintStatus
    note: str | None = Field(default=None, max_length=500)


class StatusUpdateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    old_status: str | None
    new_status: str
    note: str | None
    created_at: datetime


class ComplaintOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    category: str
    location: str
    location_type: str
    severity: int
    people_affected: int
    previous_complaints: int
    near_school: bool
    near_hospital: bool
    traffic_level: str
    priority_score: float
    priority_level: str
    priority_breakdown: list[PriorityFactorOut]
    status: str
    has_attachment: bool
    attachment_name: str | None
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def reference(self) -> str:
        return f"CF-{self.id:04d}"


class ComplaintDetailOut(ComplaintOut):
    status_history: list[StatusUpdateOut]
    videos: list[VideoAnalysisOut]


class ComplaintListOut(BaseModel):
    items: list[ComplaintOut]
    total: int
    limit: int
    offset: int


class DashboardOut(BaseModel):
    total: int
    pending: int
    in_progress: int
    resolved: int
    priority_distribution: dict[str, int]
    category_distribution: dict[str, int]
    recent: list[ComplaintOut]


def priority_to_schema(result: Any) -> PriorityOut:
    return PriorityOut(**result.to_dict())
