from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.api.routers import datasets, rules, runs  # добавили runs

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Data Quality Service starting up...")
    yield
    print("👋 Data Quality Service shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    description="Сервис проверки качества данных для Spark-пайплайнов",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры
app.include_router(datasets.router, prefix=settings.API_V1_PREFIX)
app.include_router(rules.router, prefix=settings.API_V1_PREFIX)
app.include_router(runs.router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}


@app.get("/", tags=["System"])
async def root():
    return {"message": "Data Quality Service for Spark", "docs": "/docs"}
