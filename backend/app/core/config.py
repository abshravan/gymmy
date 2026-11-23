from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env, wherever the process is started from.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

# Any port on this machine: localhost, 127.0.0.1 or [::1], over http or https.
LOCAL_ORIGINS = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/gymmy"
    jwt_secret: str = "dev-only-secret-change-me-in-every-real-environment"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 14
    # Browser origins allowed to call the API directly (comma separated), e.g. your
    # deployed frontend. The bundled Next.js app proxies /api/v1, so it needs no CORS.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Regex for extra allowed origins. Defaults to any local port for development;
    # set CORS_ORIGIN_REGEX= (empty) in production.
    cors_origin_regex: str = LOCAL_ORIGINS
    # A repeat check-in for the same member inside this window returns the existing record.
    checkin_dedupe_minutes: int = 30
    # "Explore the demo": each visitor gets a private sandbox gym with sample data.
    demo_enabled: bool = True
    demo_ttl_hours: int = 24
    demo_max_active: int = 200

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
