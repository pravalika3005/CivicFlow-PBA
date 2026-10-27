"""CivicFlow PBA - FastAPI application factory."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import complaints, meta, videos
from app.core.config import Settings, get_settings
from app.db.base import init_db, make_engine, make_session_factory

# Any port on this computer's own addresses is allowed (local development only).
LOCAL_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"

# The built website (made by `npm run build`). When it exists, the backend serves it too,
# so the whole app runs from one window at http://127.0.0.1:8000.
DEFAULT_SITE_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def create_app(settings: Settings | None = None, site_dir: Path | None = None) -> FastAPI:
    settings = settings or get_settings()
    site_dir = DEFAULT_SITE_DIR if site_dir is None else site_dir

    engine = make_engine(settings.database_url)
    init_db(engine)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(
        title="CivicFlow PBA API",
        description="AI-powered civic complaint prioritization and video analysis.",
        version="1.0.0",
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=LOCAL_ORIGIN_REGEX,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(meta.router)
    app.include_router(complaints.router)
    app.include_router(videos.router)

    index_file = site_dir / "index.html"
    if index_file.is_file():
        if (site_dir / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=site_dir / "assets"), name="assets")

        # Registered last so /api and /docs always win. Any other address returns the
        # website, which then shows the right page itself (client-side routing).
        @app.get("/{path:path}", include_in_schema=False)
        def website(path: str):
            if path.startswith("api/") or path == "api":
                raise HTTPException(status_code=404, detail="Not Found")
            candidate = (site_dir / path).resolve()
            if path and candidate.is_file() and site_dir.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(index_file)
    else:
        @app.get("/", include_in_schema=False)
        def root():
            return {
                "name": "CivicFlow PBA API",
                "status": "running",
                "api_docs": "/docs",
                "health_check": "/api/health",
                "website": "http://localhost:5173 (run the website separately, or run `npm run build` in frontend)",
            }

    return app


app = create_app()
