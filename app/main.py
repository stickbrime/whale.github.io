"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models, schemas
from app.api import auth, categories, coupons, customers, employees, orders, products
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

app.include_router(customers.router, prefix="/api/v1")
app.include_router(employees.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(coupons.router, prefix="/api/v1")


@app.get("/", include_in_schema=False)
def root():
    return {"message": settings.app_name, "docs": "/docs"}


@app.get("/health", response_model=schemas.HealthResponse, tags=["System"])
def health_check():
    return {"status": "healthy", "service": settings.app_name}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
