from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/gymmy"
    jwt_secret: str = "dev-only-secret-change-me-in-every-real-environment"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 14
    cors_origins: str = "http://localhost:3000"
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
