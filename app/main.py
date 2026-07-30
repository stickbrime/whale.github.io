"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import models, schemas
from app.api import auth, categories, customers, employees, orders, products
from app.config import settings
from app.database import Base, engine
from app.integrity import prepare_database


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
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.auth_state_secret,
    same_site="lax",
    https_only=settings.onelogin_redirect_uri.startswith("https://"),
    max_age=60 * 60 * 24 * 7,
)

app.include_router(customers.router, prefix="/api/v1")
app.include_router(employees.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")

frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="frontend-assets")


@app.get("/", include_in_schema=False)
def root():
    index = frontend_dist / "index.html"
    if index.is_file():
        return FileResponse(index)
    return {"message": settings.app_name, "docs": "/docs"}


@app.get("/health", response_model=schemas.HealthResponse, tags=["System"])
def health_check():
    return {"status": "healthy", "service": settings.app_name}


@app.get("/{full_path:path}", include_in_schema=False)
def frontend_routes(full_path: str):
    """Allow client-side React Router paths to load on refresh."""
    index = frontend_dist / "index.html"
    if index.is_file():
        return FileResponse(index)
    return {"message": settings.app_name, "docs": "/docs"}
