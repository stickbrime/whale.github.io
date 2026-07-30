"""Application configuration loaded from environment variables."""

import os
from dataclasses import dataclass
from typing import List

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_name: str = "Coffee Shop Ordering API"
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./coffee_shop.db")
    cors_origins_raw: str = os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://localhost:5173"
    )
    onelogin_base_url: str = os.getenv("ONELOGIN_BASE_URL", "https://auth.beijing.academy")
    onelogin_client_id: str = os.getenv("ONELOGIN_CLIENT_ID", "")
    onelogin_client_secret: str = os.getenv("ONELOGIN_CLIENT_SECRET", "")
    onelogin_redirect_uri: str = os.getenv(
        "ONELOGIN_REDIRECT_URI", "http://127.0.0.1:8000/api/v1/auth/callback"
    )
    auth_state_secret: str = os.getenv("AUTH_STATE_SECRET", "change-me-in-production")

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    @property
    def onelogin_configured(self) -> bool:
        return bool(self.onelogin_client_id and self.onelogin_client_secret)


settings = Settings()
