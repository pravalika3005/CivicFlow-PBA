"""Application settings.

Values come from environment variables (prefix ``CIVICFLOW_``) or from an
optional ``backend/.env`` file. Nothing secret is stored in source code.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]  # the ``backend`` folder


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_prefix="CIVICFLOW_",
        extra="ignore",
    )

    database_url: str = f"sqlite:///{(BASE_DIR / 'civicflow.db').as_posix()}"
    upload_dir: Path = BASE_DIR / "uploads"
    max_video_mb: int = 100
    max_image_mb: int = 5
    # Comma-separated list of allowed browser origins (local development).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
