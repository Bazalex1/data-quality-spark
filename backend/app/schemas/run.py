from datetime import datetime
from pydantic import BaseModel
from typing import Optional, Any, List
from app.schemas.result import ResultResponse  # создадим чуть ниже


class RunCreate(BaseModel):
    dataset_id: int


class RunResponse(BaseModel):
    id: int
    dataset_id: int
    status: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    summary_json: Optional[dict] = None

    class Config:
        from_attributes = True


class RunDetailResponse(RunResponse):
    results: List["ResultResponse"] = []
