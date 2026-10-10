from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    debug: bool = False
    database_url: str = "sqlite:///./focusguard.db"

    supabase_url: str = ""
    supabase_jwks_url: str = ""
    supabase_issuer: str = ""
    supabase_audience: str = "authenticated"
    supabase_service_role_key: str = ""

    dashboard_origins: str = "http://localhost:8081"
    extension_id: str = ""

    @property
    def allowed_origins(self) -> list[str]:
        origins = [o.strip() for o in self.dashboard_origins.split(",") if o.strip()]
        if self.extension_id:
            origins.append(f"chrome-extension://{self.extension_id}")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
