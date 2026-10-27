from tests.conftest import VALID_COMPLAINT


def upload(client, path, **data):
    with open(path, "rb") as handle:
        return client.post("/api/videos", files={"file": (path.name, handle, "video/x-msvideo")}, data=data)


def test_video_is_validated_then_really_analysed(client, moving_video):
    response = upload(client, moving_video)
    assert response.status_code == 202, response.text
    video_id = response.json()["id"]

    body = client.get(f"/api/videos/{video_id}").json()  # background job has finished
    assert body["status"] == "completed", body
    assert body["progress"] == 100 and body["error"] is None

    result = body["result"]
    meta = result["metadata"]
    assert (meta["width"], meta["height"]) == (160, 120)
    assert meta["fps"] == 10.0
    assert meta["frame_count"] == 30
    assert meta["duration_s"] == 3.0

    assert result["motion"]["mean_pct"] > 1.0
    assert result["motion"]["events"], "a moving object should create at least one motion event"
    assert result["people"]["available"] in (True, False)
    if result["people"]["available"]:
        assert result["people"]["frames_checked"] > 0
    assert result["behavior_classification"]["available"] is False
    assert result["limitations"] and result["summary"]


def test_motion_result_depends_on_the_video(client, moving_video, static_video):
    moving = client.get(f"/api/videos/{upload(client, moving_video).json()['id']}").json()["result"]
    still = client.get(f"/api/videos/{upload(client, static_video).json()['id']}").json()["result"]
    assert still["motion"]["mean_pct"] == 0.0
    assert still["motion"]["events"] == []
    assert still["motion"]["activity_level"] == "low"
    assert moving["motion"]["mean_pct"] > still["motion"]["mean_pct"]


def test_video_can_be_linked_to_a_complaint(client, moving_video, complaint_payload):
    cid = client.post("/api/complaints", json=complaint_payload).json()["id"]
    video = upload(client, moving_video, complaint_id=str(cid)).json()
    assert video["complaint_id"] == cid

    detail = client.get(f"/api/complaints/{cid}").json()
    assert [v["id"] for v in detail["videos"]] == [video["id"]]
    assert detail["videos"][0]["status"] == "completed"
    assert [v["id"] for v in client.get("/api/videos", params={"complaint_id": cid}).json()] == [video["id"]]
    # Video analysis never silently rewrites the documented priority score.
    assert detail["priority_score"] == client.get(f"/api/complaints/{cid}").json()["priority_score"]


def test_unknown_complaint_is_rejected(client, moving_video):
    assert upload(client, moving_video, complaint_id="999").status_code == 404


def test_video_upload_validation(make_client, tmp_path):
    client = make_client("videolimits", max_video_mb=1)

    wrong_type = tmp_path / "notes.txt"
    wrong_type.write_bytes(b"hello")
    assert upload(client, wrong_type).status_code == 415

    fake = tmp_path / "fake.mp4"
    fake.write_bytes(b"this is not a video at all" * 100)
    response = upload(client, fake)
    assert response.status_code == 415
    assert "video" in response.json()["detail"].lower()

    empty = tmp_path / "empty.mp4"
    empty.write_bytes(b"")
    assert upload(client, empty).status_code == 400

    huge = tmp_path / "huge.mp4"
    huge.write_bytes(b"\x00" * (1024 * 1024 + 10))
    assert upload(client, huge).status_code == 413

    stored = list((client.app.state.settings.upload_dir / "videos").glob("*"))
    assert stored == [], "rejected uploads must not leave files behind"
    assert client.get("/api/videos").json() == []


def test_missing_video_returns_404(client):
    assert client.get("/api/videos/42").status_code == 404
    assert client.get("/api/videos/42/file").status_code == 404
