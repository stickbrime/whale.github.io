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

    # Receipt printer (USB serial / ESC-POS thermal printer)
    printer_enabled: bool = os.getenv("PRINTER_ENABLED", "false").lower() == "true"
    printer_port: str = os.getenv("PRINTER_PORT", "/dev/ttyUSB0")
    printer_baudrate: int = int(os.getenv("PRINTER_BAUDRATE", "9600"))
    printer_width: int = int(os.getenv("PRINTER_WIDTH", "32"))
    printer_encoding: str = os.getenv("PRINTER_ENCODING", "gbk")
    printer_shop_name: str = os.getenv("PRINTER_SHOP_NAME", "咖啡店")

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]


settings = Settings()
