"""Dependency-only helpers that MUST NOT import from app.api.*.

Keep this file free of any app.api submodule imports — auth.py, orders.py,
and products.py all depend on it, so it is the hub used to break the
otherwise circular auth ↔ orders dependency caused by require_admin.
"""

from fastapi import HTTPException, Request, status


ADMIN_COOKIE = "whale_admin"


def is_admin(request: Request) -> bool:
    """Return True if the request carries a valid admin session cookie."""
    return request.cookies.get(ADMIN_COOKIE) == "1"


def require_admin(request: Request) -> None:
    """Dependency: ensure the caller is authenticated as admin.

    Only the admin session cookie issued by ``/auth/admin/login`` grants
    access — regular customer login has no effect on this check.
    """
    if not is_admin(request):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
        )
