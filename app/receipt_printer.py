"""ESC/POS thermal receipt printer service over USB serial.

Sends order receipts to a thermal printer (e.g. 58mm/80mm) connected via a
USB-to-serial adapter.  When no physical printer is connected the receipt
text is returned to the caller so the frontend can display a preview.
"""

import logging
import unicodedata
from datetime import datetime
from decimal import Decimal
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# ── ESC/POS command helpers ──────────────────────────────────────────────
INIT = b"\x1b\x40"          # initialise printer
ALIGN_C = b"\x1b\x61\x01"    # centre
ALIGN_L = b"\x1b\x61\x00"   # left
BOLD_ON = b"\x1b\x45\x01"
BOLD_OFF = b"\x1b\x45\x00"
DBL_ON = b"\x1d\x21\x11"    # double width + height
DBL_OFF = b"\x1d\x21\x00"
CUT = b"\x1d\x56\x00"       # full cut
FEED = b"\x1b\x64\x03"      # feed 3 lines

WIDTH = settings.printer_width

PAYMENT_METHOD_CN = {
    "cash": "现金",
    "wechat": "微信支付",
    "alipay": "支付宝",
    "card": "银行卡",
}
PAYMENT_STATUS_CN = {
    "pending": "待支付",
    "paid": "已支付",
    "failed": "支付失败",
    "refunded": "已退款",
    "cancelled": "已取消",
}


# ── Byte-level helpers (for the physical printer) ────────────────────────

def _enc(text: str) -> bytes:
    return text.encode(settings.printer_encoding, errors="replace")


def _line_b(char: str = "-", width: int = WIDTH) -> bytes:
    return _enc(char * width) + b"\n"


def _row_b(left: str, right: str, width: int = WIDTH) -> bytes:
    left_b = _enc(left)
    right_b = _enc(right)
    gap = width - len(left_b) - len(right_b)
    if gap < 1:
        return left_b + b"\n" + b" " * (width - len(right_b)) + right_b + b"\n"
    return left_b + b" " * gap + right_b + b"\n"


# ── Text-level helpers (for frontend preview) ───────────────────────────

def _dw(text: str) -> int:
    """Display width: CJK/fullwidth chars count as 2, others as 1."""
    return sum(
        2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
        for ch in text
    )


def _line_t(char: str = "-", width: int = WIDTH) -> str:
    return char * width


def _row_t(left: str, right: str, width: int = WIDTH) -> str:
    gap = width - _dw(left) - _dw(right)
    if gap < 1:
        return left + "\n" + " " * (width - _dw(right)) + right
    return left + " " * gap + right


def _center_t(text: str, width: int = WIDTH) -> str:
    pad = max(0, (width - _dw(text)) // 2)
    return " " * pad + text


# ── Shared content extraction ───────────────────────────────────────────

def _item_info(item) -> tuple[str, int, Decimal, Decimal]:
    name = getattr(
        getattr(item, "product", None),
        "product_name",
        f"商品#{getattr(item, 'product_id', '?')}",
    )
    qty = getattr(item, "quantity", 1)
    unit_price = getattr(item, "unit_price", Decimal("0"))
    subtotal = getattr(item, "subtotal", Decimal("0"))
    return name, qty, unit_price, subtotal


def build_receipt(
    *,
    shop_name: str,
    order_id: int,
    order_date: datetime,
    customer_name: Optional[str],
    items: list,
    total: Decimal,
    payment_method: str,
    payment_status: str,
    pickup_code: Optional[str],
    pickup_time: Optional[str] = None,
) -> bytes:
    """Assemble the full ESC/POS byte stream for an order receipt."""
    buf = bytearray()
    buf += INIT
    buf += ALIGN_C
    buf += BOLD_ON + DBL_ON + _enc(shop_name) + DBL_OFF + BOLD_OFF + b"\n\n"
    buf += _line_b("=")

    buf += ALIGN_L
    buf += _row_b(f"订单号: #{order_id}", "")
    buf += _row_b(f"日期: {order_date.strftime('%Y-%m-%d %H:%M')}", "")
    if customer_name:
        buf += _row_b(f"客户: {customer_name}", "")
    buf += _line_b("-")

    buf += BOLD_ON
    buf += _row_b("商品", "小计")
    buf += BOLD_OFF
    buf += _line_b("-")
    for item in items:
        name, qty, unit_price, subtotal = _item_info(item)
        buf += _enc(name[:WIDTH]) + b"\n"
        buf += _row_b(f"  {qty}x {unit_price}", f"￥{subtotal}")
    buf += _line_b("-")

    buf += BOLD_ON + DBL_ON
    buf += _row_b("合计", f"￥{total}")
    buf += DBL_OFF + BOLD_OFF
    buf += _line_b("=")

    buf += ALIGN_L
    buf += _row_b("支付方式:", PAYMENT_METHOD_CN.get(payment_method, payment_method))
    buf += _row_b("支付状态:", PAYMENT_STATUS_CN.get(payment_status, payment_status))
    if pickup_time:
        buf += _row_b("取餐时间:", pickup_time[:5] if len(pickup_time) >= 5 else pickup_time)
    else:
        buf += _row_b("取餐时间:", "尽快")
    buf += b"\n"

    if pickup_code:
        buf += ALIGN_C
        buf += BOLD_ON + _enc("— 取餐码 —") + BOLD_OFF + b"\n"
        buf += DBL_ON + BOLD_ON + _enc(pickup_code) + BOLD_OFF + DBL_OFF + b"\n\n"
        buf += ALIGN_L
        buf += _line_b("=")

    buf += ALIGN_C
    buf += _enc("感谢您的惠顾！") + b"\n"
    buf += _enc("Thank you!") + b"\n"
    buf += FEED + CUT
    return bytes(buf)


def build_receipt_text(
    *,
    shop_name: str,
    order_id: int,
    order_date: datetime,
    customer_name: Optional[str],
    items: list,
    total: Decimal,
    payment_method: str,
    payment_status: str,
    pickup_code: Optional[str],
    pickup_time: Optional[str] = None,
) -> str:
    """Plain-text version of the receipt for on-screen preview."""
    lines: list[str] = []
    lines.append(_center_t(shop_name))
    lines.append("")
    lines.append(_line_t("="))
    lines.append(_row_t(f"订单号: #{order_id}", ""))
    lines.append(_row_t(f"日期: {order_date.strftime('%Y-%m-%d %H:%M')}", ""))
    if customer_name:
        lines.append(_row_t(f"客户: {customer_name}", ""))
    lines.append(_line_t("-"))
    lines.append(_row_t("商品", "小计"))
    lines.append(_line_t("-"))
    for item in items:
        name, qty, unit_price, subtotal = _item_info(item)
        lines.append(name[:WIDTH])
        lines.append(_row_t(f"  {qty}x {unit_price}", f"￥{subtotal}"))
    lines.append(_line_t("-"))
    lines.append(_row_t("合计", f"￥{total}"))
    lines.append(_line_t("="))
    lines.append(_row_t("支付方式:", PAYMENT_METHOD_CN.get(payment_method, payment_method)))
    lines.append(_row_t("支付状态:", PAYMENT_STATUS_CN.get(payment_status, payment_status)))
    lines.append(_row_t("取餐时间:", pickup_time[:5] if pickup_time else "尽快"))
    lines.append("")
    if pickup_code:
        lines.append(_center_t("— 取餐码 —"))
        lines.append(_center_t(pickup_code))
        lines.append(_line_t("="))
    lines.append(_center_t("感谢您的惠顾！"))
    lines.append(_center_t("Thank you!"))
    return "\n".join(lines)


def _try_send(data: bytes) -> bool:
    """Open the serial port and send *data*. Returns True on success."""
    try:
        import serial
    except ImportError:
        logger.warning("pyserial not installed — cannot print to physical printer")
        return False

    try:
        with serial.Serial(
            port=settings.printer_port,
            baudrate=settings.printer_baudrate,
            bytesize=8,
            parity="N",
            stopbits=1,
            timeout=2,
            write_timeout=5,
        ) as ser:
            ser.write(data)
            ser.flush()
            logger.info("Receipt sent to printer on %s", settings.printer_port)
            return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Printer not available on %s: %s", settings.printer_port, exc)
        return False


def print_receipt(
    *,
    shop_name: str,
    order_id: int,
    order_date: datetime,
    customer_name: Optional[str],
    items: list,
    total: Decimal,
    payment_method: str,
    payment_status: str,
    pickup_code: Optional[str],
    pickup_time: Optional[str] = None,
) -> dict:
    """Build a receipt, send it to the printer, and return a status result.

    Returns a dict with keys:
        status          — "printed" | "no_printer" | "disabled"
        receipt_preview — plain-text receipt (present when not printed)
    """
    common = dict(
        shop_name=shop_name,
        order_id=order_id,
        order_date=order_date,
        customer_name=customer_name,
        items=items,
        total=total,
        payment_method=payment_method,
        payment_status=payment_status,
        pickup_code=pickup_code,
        pickup_time=pickup_time,
    )

    if not settings.printer_enabled:
        return {
            "status": "disabled",
            "receipt_preview": build_receipt_text(**common),
        }

    try:
        data = build_receipt(**common)
        preview = build_receipt_text(**common)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to build receipt for order #%s: %s", order_id, exc)
        return {
            "status": "no_printer",
            "receipt_preview": f"小票生成失败: {exc}",
        }

    if _try_send(data):
        return {"status": "printed", "receipt_preview": None}

    return {"status": "no_printer", "receipt_preview": preview}
