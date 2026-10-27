"""Complaint endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_settings_dep
from app.core.config import Settings
from app.core.enums import Category, ComplaintStatus, PriorityLevel
from app.db.repository import ComplaintRepository
from app.schemas.complaint import (
    ComplaintCreate,
    ComplaintDetailOut,
    ComplaintListOut,
    ComplaintOut,
    PriorityOut,
    PriorityPreviewRequest,
    StatusUpdateRequest,
    priority_to_schema,
)
from app.services.priority import PriorityInputError, calculate_priority
from app.services.storage import IMAGE_EXTENSIONS, remove_file, save_upload

router = APIRouter(prefix="/api", tags=["complaints"])

PRIORITY_FIELDS = (
    "severity", "people_affected", "previous_complaints",
    "near_school", "near_hospital", "traffic_level", "location_type",
)


def _priority_or_422(values: dict):
    try:
        return calculate_priority(values)
    except PriorityInputError as exc:
        raise HTTPException(status_code=422, detail=exc.errors) from exc


def _get_or_404(repo: ComplaintRepository, complaint_id: int):
    complaint = repo.get(complaint_id)
    if complaint is None:
        raise HTTPException(status_code=404, detail=f"Complaint {complaint_id} was not found.")
    return complaint


@router.post("/priority/preview", response_model=PriorityOut)
def preview_priority(payload: PriorityPreviewRequest) -> PriorityOut:
    """Calculate a priority score without saving anything (used for the live preview)."""
    values = payload.model_dump(mode="json")
    return priority_to_schema(_priority_or_422(values))


@router.post("/complaints", response_model=ComplaintDetailOut, status_code=201)
def create_complaint(payload: ComplaintCreate, db: Session = Depends(get_db)):
    values = payload.model_dump(mode="json")
    result = _priority_or_422({k: values[k] for k in PRIORITY_FIELDS})
    complaint = ComplaintRepository(db).create(
        {
            **values,
            "priority_score": result.score,
            "priority_level": result.level,
            "priority_breakdown": result.to_dict()["breakdown"],
            "status": ComplaintStatus.pending.value,
        }
    )
    return complaint


@router.get("/complaints", response_model=ComplaintListOut)
def list_complaints(
    search: str | None = Query(default=None, max_length=100),
    status: ComplaintStatus | None = None,
    priority_level: PriorityLevel | None = None,
    category: Category | None = None,
    sort: str = Query(default="newest", pattern="^(newest|priority)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    items, total = ComplaintRepository(db).list(
        search=search,
        status=status.value if status else None,
        priority_level=priority_level.value if priority_level else None,
        category=category.value if category else None,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return ComplaintListOut(
        items=[ComplaintOut.model_validate(c) for c in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/complaints/{complaint_id}", response_model=ComplaintDetailOut)
def get_complaint(complaint_id: int, db: Session = Depends(get_db)):
    return _get_or_404(ComplaintRepository(db), complaint_id)


@router.patch("/complaints/{complaint_id}/status", response_model=ComplaintDetailOut)
def update_status(complaint_id: int, payload: StatusUpdateRequest, db: Session = Depends(get_db)):
    repo = ComplaintRepository(db)
    complaint = _get_or_404(repo, complaint_id)
    if complaint.status == payload.status.value:
        raise HTTPException(
            status_code=409, detail=f"The complaint is already marked as '{payload.status.value}'."
        )
    return repo.update_status(complaint, payload.status.value, payload.note)


@router.post("/complaints/{complaint_id}/attachment", response_model=ComplaintDetailOut)
def upload_attachment(
    complaint_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    repo = ComplaintRepository(db)
    complaint = _get_or_404(repo, complaint_id)
    path, _size = save_upload(
        file,
        settings.upload_dir / "attachments",
        IMAGE_EXTENSIONS,
        settings.max_image_mb * 1024 * 1024,
        "image",
    )
    old = complaint.attachment_path
    updated = repo.set_attachment(complaint, str(path), file.filename or path.name)
    if old and old != str(path):
        remove_file(old)
    return updated


@router.get("/complaints/{complaint_id}/attachment")
def download_attachment(complaint_id: int, db: Session = Depends(get_db)):
    complaint = _get_or_404(ComplaintRepository(db), complaint_id)
    if not complaint.attachment_path:
        raise HTTPException(status_code=404, detail="This complaint has no attachment.")
    return FileResponse(complaint.attachment_path, filename=complaint.attachment_name)
