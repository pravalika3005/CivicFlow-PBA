import os
import tempfile
from pathlib import Path

# Point the default app (created when app.main is imported) at a throw-away folder
# so running tests never creates files in the real project.
_IMPORT_TMP = tempfile.mkdtemp(prefix="civicflow-import-")
os.environ["CIVICFLOW_DATABASE_URL"] = f"sqlite:///{Path(_IMPORT_TMP, 'import.db').as_posix()}"
os.environ["CIVICFLOW_UPLOAD_DIR"] = str(Path(_IMPORT_TMP, "uploads"))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

VALID_COMPLAINT = {
    "title": "Large pothole near bus stop",
    "description": "A deep pothole is damaging vehicles and blocking the left lane.",
    "category": "road_damage",
    "location": "MG Road, near Metro Pillar 42",
    "location_type": "main_road",
    "severity": 4,
    "people_affected": 500,
    "previous_complaints": 2,
    "near_school": True,
    "near_hospital": False,
    "traffic_level": "high",
}


@pytest.fixture
def make_client(tmp_path):
    """Factory: build an isolated app. Pass the same ``name`` twice to simulate a restart."""
    clients = []

    def _make(name: str = "main", site_dir=None, **overrides) -> TestClient:
        settings = Settings(
            database_url=f"sqlite:///{(tmp_path / f'{name}.db').as_posix()}",
            upload_dir=tmp_path / f"{name}-uploads",
            **overrides,
        )
        client = TestClient(create_app(settings, site_dir=site_dir or tmp_path / "no-site"))
        clients.append(client)
        return client

    yield _make
    for c in clients:
        c.app.state.engine.dispose()


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture
def complaint_payload():
    return dict(VALID_COMPLAINT)


def _write_video(path: Path, moving: bool, seconds: int = 3, fps: int = 10) -> Path:
    width, height = 160, 120
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter.fourcc(*"MJPG"), fps, (width, height))
    assert writer.isOpened(), "OpenCV could not create a test video"
    for i in range(seconds * fps):
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        if moving:
            x = (i * 12) % (width - 40)
            cv2.rectangle(frame, (x, 30), (x + 40, 90), (255, 255, 255), -1)
        writer.write(frame)
    writer.release()
    return path


@pytest.fixture
def moving_video(tmp_path):
    return _write_video(tmp_path / "moving.avi", moving=True)


@pytest.fixture
def static_video(tmp_path):
    return _write_video(tmp_path / "static.avi", moving=False)
