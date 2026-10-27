"""Video upload and analysis endpoints."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_settings_dep
from app.core.config import Settings
from app.db.repository import ComplaintRepository, VideoRepository
from app.schemas.video import VideoAnalysisOut
from app.services.storage import VIDEO_EXTENSIONS, remove_file, save_upload
from app.services.video_analysis import VideoAnalysisError, analyze_video, check_video_readable

logger = logging.getLogger("civicflow.video")

router = APIRouter(prefix="/api", tags=["video"])


def run_analysis(session_factory, video_id: int, path: str) -> None:
    """Background job: analyse the video and store the real result (or the real error)."""
    session = session_factory()
    try:
        repo = VideoRepository(session)
        repo.mark_processing(video_id)
        last = {"value": -10}

        def on_progress(value: int) -> None:
            if value - last["value"] >= 5:  # avoid a database write for every frame
                last["value"] = value
                repo.set_progress(video_id, value)

        try:
            result = analyze_video(Path(path), on_progress)
        except VideoAnalysisError as exc:
            repo.mark_failed(video_id, str(exc))
        except Exception as exc:  # noqa: BLE001 - recorded, not hidden
            logger.exception("Video analysis crashed for video %s", video_id)
            repo.mark_failed(video_id, f"Unexpected analysis error: {exc}")
        else:
            repo.mark_completed(video_id, result)
    finally:
        session.close()


@router.post("/videos", response_model=VideoAnalysisOut, status_code=202)
def upload_video(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    complaint_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    if complaint_id is not None and ComplaintRepository(db).get(complaint_id) is None:
        raise HTTPException(status_code=404, detail=f"Complaint {complaint_id} was not found.")

    path, size = save_upload(
        file,
        settings.upload_dir / "videos",
        VIDEO_EXTENSIONS,
        settings.max_video_mb * 1024 * 1024,
        "video",
    )
    try:
        check_video_readable(path)
    except VideoAnalysisError as exc:
        remove_file(path)
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    video = VideoRepository(db).create(
        complaint_id=complaint_id,
        original_filename=file.filename or path.name,
        stored_path=str(path),
        content_type=file.content_type,
        size_bytes=size,
        status="queued",
        progress=0,
    )
    background_tasks.add_task(run_analysis, request.app.state.session_factory, video.id, str(path))
    return video


@router.get("/videos", response_model=list[VideoAnalysisOut])
def list_videos(complaint_id: int | None = None, db: Session = Depends(get_db)):
    return VideoRepository(db).list(complaint_id=complaint_id)


@router.get("/videos/{video_id}", response_model=VideoAnalysisOut)
def get_video(video_id: int, db: Session = Depends(get_db)):
    video = VideoRepository(db).get(video_id)
    if video is None:
        raise HTTPException(status_code=404, detail=f"Video {video_id} was not found.")
    return video


@router.get("/videos/{video_id}/file")
def stream_video(video_id: int, db: Session = Depends(get_db)):
    video = VideoRepository(db).get(video_id)
    if video is None or not Path(video.stored_path).exists():
        raise HTTPException(status_code=404, detail="The video file was not found.")
    return FileResponse(video.stored_path, filename=video.original_filename)
