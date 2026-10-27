"""Safe file saving and validation for uploads."""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, UploadFile

CHUNK = 1024 * 1024  # 1 MB

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def _looks_like_image(head: bytes, ext: str) -> bool:
    if ext in {".jpg", ".jpeg"}:
        return head.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    return False


def save_upload(
    upload: UploadFile,
    dest_dir: Path,
    allowed_extensions: set[str],
    max_bytes: int,
    kind: str,
) -> tuple[Path, int]:
    """Stream an upload to disk, enforcing type and size limits.

    The original file name is never used on disk (prevents path tricks);
    a random name is generated instead. Partial files are removed on error.
    Returns ``(path, size_in_bytes)``.
    """
    original = upload.filename or ""
    ext = Path(original).suffix.lower()
    if ext not in allowed_extensions:
        allowed = ", ".join(sorted(allowed_extensions))
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported {kind} type '{ext or 'unknown'}'. Allowed types: {allowed}.",
        )

    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / f"{uuid.uuid4().hex}{ext}"
    size = 0
    try:
        with path.open("wb") as out:
            first = True
            while chunk := upload.file.read(CHUNK):
                if first:
                    first = False
                    if kind == "image" and not _looks_like_image(chunk[:16], ext):
                        raise HTTPException(
                            status_code=415,
                            detail="The file content does not match its image extension.",
                        )
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"The {kind} is too large. Maximum size is {max_bytes // (1024 * 1024)} MB.",
                    )
                out.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail=f"The uploaded {kind} file is empty.")
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return path, size


def remove_file(path: str | Path | None) -> None:
    if path:
        Path(path).unlink(missing_ok=True)
