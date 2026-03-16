"""
Settings — all secrets come from environment variables ONLY.
"""
import secrets
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://collabcode:CHANGE_ME@localhost:5432/collabcode"
    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = secrets.token_hex(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    RATE_LIMIT_AUTH:     str = "10/minute"
    RATE_LIMIT_API:      str = "120/minute"
    RATE_LIMIT_TERMINAL: str = "6/minute"
    RATE_LIMIT_CHAT:     str = "30/minute"

    TERMINAL_TIMEOUT_SECONDS:  int = 30
    TERMINAL_MAX_OUTPUT_BYTES: int = 524288

    MAX_FILE_NAME_LENGTH:    int = 255
    MAX_FILE_CONTENT_BYTES:  int = 2_097_152
    MAX_CHAT_MESSAGE_LENGTH: int = 4096
    MAX_WORKSPACE_NAME_LEN:  int = 100
    MAX_FILES_PER_WORKSPACE: int = 200

    API_V1_PREFIX: str = "/api/v1"

    # ── Google OAuth ──────────────────────────────────────────────────
    GOOGLE_CLIENT_ID:     str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI:  str = "http://localhost:5173/api/v1/auth/oauth/google/callback"

    # ── GitHub OAuth ──────────────────────────────────────────────────
    GITHUB_CLIENT_ID:     str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI:  str = "http://localhost:5173/api/v1/auth/oauth/github/callback"

    # ── Frontend URL (used in OAuth redirects) ────────────────────────
    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
