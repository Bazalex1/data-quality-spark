from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Dataset(Base):
    __tablename__ = "dq_dataset"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    source_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # file | path | spark_df
    source_config_json: Mapped[str] = mapped_column(
        String, nullable=True
    )  # JSON как строка
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    rules: Mapped[list["Rule"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Dataset(id={self.id}, name='{self.name}')>"
