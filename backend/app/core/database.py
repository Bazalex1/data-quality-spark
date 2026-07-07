from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # Показывать SQL-запросы в консоли при DEBUG=True
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Базовый класс для всех моделей"""

    pass


def get_db():
    """Dependency для FastAPI (открывает и закрывает сессию)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
