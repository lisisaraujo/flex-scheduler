from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    cors_allow_origins: str = "http://localhost:3000"
    app_base_url: str = "http://localhost:3000"

    firebase_project_id: str
    firebase_web_api_key: str | None = None
    firebase_credentials_file: str | None = None
    firebase_credentials_json: str | None = None

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_pass: str | None = None
    smtp_from: str | None = None
    smtp_ssl: bool = False  # True → SMTP_SSL (port 465); False → SMTP + STARTTLS (port 587)

    super_admin_secret: str | None = None

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
