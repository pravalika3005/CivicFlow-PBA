"""Dashboard, option lists and health check."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core import enums
from app.db.repository import ComplaintRepository
from app.schemas.complaint import ComplaintOut, DashboardOut
from app.services.priority import LEVEL_THRESHOLDS, SCORE_MAX, SCORE_MIN

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/health")
def health(request: Request):
    return {"status": "ok", "settings": {"max_video_mb": request.app.state.settings.max_video_mb}}


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db)):
    repo = ComplaintRepository(db)
    counts = repo.dashboard_counts()
    by_status = counts["by_status"]
    by_priority = counts["by_priority"]
    return DashboardOut(
        total=sum(by_status.values()),
        pending=by_status.get("pending", 0),
        in_progress=by_status.get("in_progress", 0),
        resolved=by_status.get("resolved", 0),
        priority_distribution={level.value: by_priority.get(level.value, 0) for level in enums.PriorityLevel},
        category_distribution=counts["by_category"],
        recent=[ComplaintOut.model_validate(c) for c in repo.recent(5)],
    )


@router.get("/meta/options")
def options(request: Request):
    """Fixed choices and labels so the frontend never hardcodes them."""
    settings = request.app.state.settings

    def pairs(labels: dict[str, str]):
        return [{"value": k, "label": v} for k, v in labels.items()]

    return {
        "categories": pairs(enums.CATEGORY_LABELS),
        "location_types": pairs(enums.LOCATION_TYPE_LABELS),
        "traffic_levels": pairs(enums.TRAFFIC_LABELS),
        "statuses": pairs(enums.STATUS_LABELS),
        "priority_levels": pairs(enums.PRIORITY_LABELS),
        "severities": [{"value": k, "label": v} for k, v in enums.SEVERITY_LABELS.items()],
        "priority_scale": {
            "min": SCORE_MIN,
            "max": SCORE_MAX,
            "thresholds": [{"level": lvl, "from": lower} for lower, lvl in reversed(LEVEL_THRESHOLDS)],
        },
        "limits": {"max_video_mb": settings.max_video_mb, "max_image_mb": settings.max_image_mb},
    }
