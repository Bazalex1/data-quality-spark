from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, Any


class DatasetBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=255)
    source_type: str = Field(..., description="file | path | spark_df")
    source_config_json: Optional[str] = None


class DatasetCreate(DatasetBase):
    pass


class DatasetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=255)
    source_type: Optional[str] = None
    source_config_json: Optional[str] = None


class DatasetResponse(DatasetBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True  # важно для SQLAlchemy 2.0
