from app.services.priority import calculate_priority
from tests.conftest import VALID_COMPLAINT


def create(client, **changes):
    response = client.post("/api/complaints", json={**VALID_COMPLAINT, **changes})
    assert response.status_code == 201, response.text
    return response.json()


# ----------------------------------------------------------------- basics
def test_health_and_docs_load(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_options_endpoint_lists_choices(client):
    data = client.get("/api/meta/options").json()
    assert {"value": "road_damage", "label": "Road damage / potholes"} in data["categories"]
    assert data["priority_scale"]["max"] == 100
    assert [t["level"] for t in data["priority_scale"]["thresholds"]] == ["low", "medium", "high", "critical"]


# ------------------------------------------------------------ submission
def test_create_complaint_saves_priority_that_matches_engine(client):
    body = create(client)
    expected = calculate_priority(VALID_COMPLAINT)
    assert body["reference"] == "CF-0001"
    assert body["status"] == "pending"
    assert body["priority_score"] == expected.score
    assert body["priority_level"] == expected.level
    assert round(sum(i["points"] for i in body["priority_breakdown"]), 2) == body["priority_score"]
    assert [h["new_status"] for h in body["status_history"]] == ["pending"]


def test_preview_matches_saved_priority(client):
    preview = client.post(
        "/api/priority/preview",
        json={k: VALID_COMPLAINT[k] for k in (
            "severity", "people_affected", "previous_complaints", "near_school",
            "near_hospital", "traffic_level", "location_type")},
    ).json()
    saved = create(client)
    assert preview["score"] == saved["priority_score"]
    assert preview["level"] == saved["priority_level"]


def test_invalid_complaints_are_rejected_with_clear_errors(client):
    for changes in (
        {"severity": 9},
        {"severity": 0},
        {"title": "ab"},
        {"description": "too short"},
        {"category": "aliens"},
        {"people_affected": -5},
        {"traffic_level": "extreme"},
        {"location": ""},
    ):
        response = client.post("/api/complaints", json={**VALID_COMPLAINT, **changes})
        assert response.status_code == 422, changes
        assert response.json()["detail"], changes
    missing = {k: v for k, v in VALID_COMPLAINT.items() if k != "title"}
    assert client.post("/api/complaints", json=missing).status_code == 422
    assert client.get("/api/complaints").json()["total"] == 0  # nothing half-saved


# ------------------------------------------------------------ list/search
def test_list_search_filter_sort_and_pagination(client):
    create(client, title="Pothole on MG Road", severity=5, people_affected=9000, traffic_level="high")
    create(client, title="Broken streetlight", category="streetlight", location="Park Lane",
           severity=2, people_affected=10, near_school=False, traffic_level="low",
           location_type="residential", previous_complaints=0)
    create(client, title="Overflowing garbage bin", category="sanitation_waste",
           location="Market Street", severity=3, people_affected=80, near_school=False)

    everything = client.get("/api/complaints").json()
    assert everything["total"] == 3
    assert everything["items"][0]["title"] == "Overflowing garbage bin"  # newest first

    assert client.get("/api/complaints", params={"search": "streetlight"}).json()["total"] == 1
    assert client.get("/api/complaints", params={"search": "Park Lane"}).json()["total"] == 1
    assert client.get("/api/complaints", params={"search": "CF-0002"}).json()["items"][0]["title"] == "Broken streetlight"
    assert client.get("/api/complaints", params={"category": "sanitation_waste"}).json()["total"] == 1
    assert client.get("/api/complaints", params={"search": "nothing-matches-this"}).json()["items"] == []

    by_priority = client.get("/api/complaints", params={"sort": "priority"}).json()["items"]
    scores = [c["priority_score"] for c in by_priority]
    assert scores == sorted(scores, reverse=True)
    assert by_priority[0]["title"] == "Pothole on MG Road"

    level = by_priority[0]["priority_level"]
    assert all(c["priority_level"] == level for c in
               client.get("/api/complaints", params={"priority_level": level}).json()["items"])

    page = client.get("/api/complaints", params={"limit": 2, "offset": 2}).json()
    assert page["total"] == 3 and len(page["items"]) == 1

    assert client.get("/api/complaints", params={"status": "bogus"}).status_code == 422


def test_get_missing_complaint_returns_404(client):
    response = client.get("/api/complaints/999")
    assert response.status_code == 404
    assert "999" in response.json()["detail"]


# ---------------------------------------------------------------- status
def test_status_updates_are_recorded_and_validated(client):
    complaint = create(client)
    cid = complaint["id"]

    updated = client.patch(f"/api/complaints/{cid}/status",
                           json={"status": "in_progress", "note": "Crew assigned"})
    assert updated.status_code == 200
    body = updated.json()
    assert body["status"] == "in_progress"
    assert [(h["old_status"], h["new_status"]) for h in body["status_history"]] == [
        (None, "pending"), ("pending", "in_progress")]
    assert body["status_history"][-1]["note"] == "Crew assigned"

    assert client.patch(f"/api/complaints/{cid}/status", json={"status": "in_progress"}).status_code == 409
    assert client.patch(f"/api/complaints/{cid}/status", json={"status": "done"}).status_code == 422
    assert client.patch("/api/complaints/999/status", json={"status": "resolved"}).status_code == 404


def test_data_survives_a_server_restart(make_client):
    first = make_client("persist")
    cid = create(first)["id"]
    first.patch(f"/api/complaints/{cid}/status", json={"status": "resolved", "note": "Fixed"})
    first.app.state.engine.dispose()

    restarted = make_client("persist")  # a brand-new app on the same database file
    body = restarted.get(f"/api/complaints/{cid}").json()
    assert body["status"] == "resolved"
    assert [h["new_status"] for h in body["status_history"]] == ["pending", "resolved"]
    assert restarted.get("/api/dashboard").json()["resolved"] == 1


# ------------------------------------------------------------- dashboard
def test_dashboard_is_empty_then_reflects_real_data(client):
    empty = client.get("/api/dashboard").json()
    assert empty["total"] == 0 and empty["recent"] == []
    assert empty["priority_distribution"] == {"low": 0, "medium": 0, "high": 0, "critical": 0}

    a = create(client)
    b = create(client, severity=1, people_affected=1, near_school=False, traffic_level="low",
               location_type="rural", previous_complaints=0)
    create(client)
    client.patch(f"/api/complaints/{a['id']}/status", json={"status": "in_progress"})
    client.patch(f"/api/complaints/{b['id']}/status", json={"status": "resolved"})

    data = client.get("/api/dashboard").json()
    assert (data["total"], data["pending"], data["in_progress"], data["resolved"]) == (3, 1, 1, 1)
    assert sum(data["priority_distribution"].values()) == 3
    assert data["priority_distribution"][b["priority_level"]] >= 1
    assert len(data["recent"]) == 3
    assert data["recent"][0]["id"] == 3


# ------------------------------------------------------------ attachments
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def test_image_attachment_upload_and_download(client):
    cid = create(client)["id"]
    ok = client.post(f"/api/complaints/{cid}/attachment", files={"file": ("pothole.png", PNG, "image/png")})
    assert ok.status_code == 200
    assert ok.json()["has_attachment"] is True
    assert ok.json()["attachment_name"] == "pothole.png"
    download = client.get(f"/api/complaints/{cid}/attachment")
    assert download.status_code == 200 and download.content == PNG


def test_attachment_validation(make_client):
    client = make_client("limits", max_image_mb=1)
    cid = create(client)["id"]
    url = f"/api/complaints/{cid}/attachment"
    assert client.post(url, files={"file": ("a.exe", b"MZ" + b"0" * 50, "application/octet-stream")}).status_code == 415
    assert client.post(url, files={"file": ("fake.png", b"not really a png file", "image/png")}).status_code == 415
    assert client.post(url, files={"file": ("empty.png", b"", "image/png")}).status_code == 400
    big = PNG + b"\x00" * (1024 * 1024 + 10)
    assert client.post(url, files={"file": ("big.png", big, "image/png")}).status_code == 413
    assert client.get(url).status_code == 404  # nothing was stored by the failed uploads
    assert client.post("/api/complaints/999/attachment", files={"file": ("a.png", PNG, "image/png")}).status_code == 404


# ------------------------------------------------------- connection helpers
def test_root_page_points_people_to_the_docs(client):
    body = client.get("/").json()
    assert body["status"] == "running"
    assert body["api_docs"] == "/docs"


def test_cors_allows_any_local_port_but_not_other_sites(client):
    def allowed(origin):
        r = client.get("/api/health", headers={"Origin": origin})
        return r.headers.get("access-control-allow-origin") == origin

    assert allowed("http://localhost:5173")
    assert allowed("http://127.0.0.1:5173")
    assert allowed("http://localhost:5199")
    assert not allowed("http://evil.example")
    assert not allowed("http://localhost.evil.example")


def test_built_website_is_served_with_the_api(make_client, tmp_path):
    site = tmp_path / "site"
    (site / "assets").mkdir(parents=True)
    (site / "index.html").write_text("<html>CivicFlow site</html>")
    (site / "assets" / "app.js").write_text("console.log(1)")
    client = make_client("withsite", site_dir=site)

    assert "CivicFlow site" in client.get("/").text
    assert "CivicFlow site" in client.get("/complaints/5").text  # website page address
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert client.get("/api/health").json()["status"] == "ok"  # API still wins
    assert client.get("/api/nope").status_code == 404  # unknown API address is not the website
    assert client.get("/docs").status_code == 200
