from datetime import datetime
from sqlalchemy import String, Integer, Boolean, ForeignKey, DateTime, func, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Rule(Base):
    __tablename__ = "dq_rule"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    dataset_id: Mapped[int] = mapped_column(
        ForeignKey("dq_dataset.id", ondelete="CASCADE"), nullable=False
    )
    rule_name: Mapped[str] = mapped_column(String(255), nullable=False)
    rule_type: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # not_null, unique, min_max и т.д.
    column_name: Mapped[str] = mapped_column(String(255), nullable=True)
    params_json: Mapped[dict] = mapped_column(JSON, nullable=True)
    severity: Mapped[str] = mapped_column(
        String(20), default="warning"
    )  # warning | critical
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    dataset: Mapped["Dataset"] = relationship(back_populates="rules")

    def __repr__(self):
        return f"<Rule(id={self.id}, type='{self.rule_type}', column='{self.column_name}')>"
