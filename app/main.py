"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse

from app import models, schemas
from app.api import (
    account,
    auth,
    categories,
    coupons,
    customers,
    employees,
    orders,
    products,
    staff,
    stats,
    store,
)
from app.config import settings
from app.database import Base, engine
from app.integrity import prepare_database


ICP_HTML = '<div style="text-align:center;padding:20px 0;color:#666;font-size:13px;position:fixed;bottom:0;width:100%;background:#fafafa;border-top:1px solid #e0e0e0;z-index:9999;"><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" style="color:#666;text-decoration:none;">京ICP备2026054406号-1</a></div>'


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    prepare_database(engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "REST API for customers, employees, menu categories, products, inventory, "
        "and transactional coffee orders."
    ),
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(customers.router, prefix="/api/v1")
app.include_router(employees.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(coupons.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(account.router, prefix="/api/v1")
app.include_router(staff.router, prefix="/api/v1")
app.include_router(store.router, prefix="/api/v1")


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html() -> HTMLResponse:
    return HTMLResponse(get_swagger_ui_html(openapi_url="/openapi.json", title=f"{settings.app_name} - Docs").body.decode() + ICP_HTML)


@app.get("/", include_in_schema=False)
def root():
    return {"message": settings.app_name, "docs": "/docs"}


@app.get("/health", response_model=schemas.HealthResponse, tags=["System"])
def health_check():
    return {"status": "healthy", "service": settings.app_name}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
