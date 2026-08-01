from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "FocusGuard"
    app_env: str = "development"
    debug: bool = True

    database_url: str = ""

    ai_provider: str = "mock"
    ai_model: str = "deepseek-chat"

    deepseek_api_key: str = ""
    openai_api_key: str = ""
    openai_api_key_first: str = ""
    openai_api_key_second: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    openai_audio_model: str = "whisper-1"

    claude_api_key: str = ""
    claude_model: str = "claude-3-5-sonnet-latest"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:0.6b"

    cors_origins: str = "http://localhost:8081,http://localhost:19006"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
