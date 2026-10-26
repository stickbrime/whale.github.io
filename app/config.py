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
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173,"
        "http://42.192.110.219,http://42.192.110.219:5173,"
        "https://42.192.110.219,https://42.192.110.219:5173,"
        "http://www.whalecoffeeshop.cloud:5173,https://www.whalecoffeeshop.cloud,"
        "http://whalecoffeeshop.cloud:5173,https://whalecoffeeshop.cloud"
    )

    # Receipt printer (USB serial / ESC-POS thermal printer)
    printer_enabled: bool = os.getenv("PRINTER_ENABLED", "false").lower() == "true"
    printer_port: str = os.getenv("PRINTER_PORT", "/dev/ttyUSB0")
    printer_baudrate: int = int(os.getenv("PRINTER_BAUDRATE", "9600"))
    printer_width: int = int(os.getenv("PRINTER_WIDTH", "32"))
    printer_encoding: str = os.getenv("PRINTER_ENCODING", "gbk")
    printer_shop_name: str = os.getenv("PRINTER_SHOP_NAME", "咖啡店")

    # Public origin of the frontend, used to build OAuth redirect URIs.
    public_base_url: str = os.getenv("PUBLIC_BASE_URL", "http://localhost:5173")

    # LinkBAID / Seiue student SSO (school account login).
    seiue_host: str = os.getenv("ONELOGIN_HOST", "")
    seiue_client_id: str = os.getenv("ONELOGIN_CLIENT_ID", "")
    seiue_client_secret: str = os.getenv("ONELOGIN_CLIENT_SECRET", "")
    seiue_token_path: str = os.getenv("ONELOGIN_TOKEN_PATH", "/oauth/token")
    seiue_userinfo_path: str = os.getenv("ONELOGIN_USERINFO_PATH", "/oauth/userinfo")

    # Feishu (Lark) open-platform OAuth.
    feishu_app_id: str = os.getenv("FEISHU_APP_ID", "")
    feishu_app_secret: str = os.getenv("FEISHU_APP_SECRET", "")

    # WeChat open-platform web login.
    wechat_app_id: str = os.getenv("WECHAT_APP_ID", "")
    wechat_app_secret: str = os.getenv("WECHAT_APP_SECRET", "")

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    @property
    def seiue_configured(self) -> bool:
        return bool(self.seiue_host and self.seiue_client_id and self.seiue_client_secret)

    @property
    def feishu_configured(self) -> bool:
        return bool(self.feishu_app_id and self.feishu_app_secret)

    @property
    def wechat_configured(self) -> bool:
        return bool(self.wechat_app_id and self.wechat_app_secret)


settings = Settings()
