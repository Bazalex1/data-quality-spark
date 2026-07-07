from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, Any


class RuleBase(BaseModel):
    rule_name: str = Field(..., min_length=3, max_length=255)
    rule_type: str
    column_name: Optional[str] = None
    params_json: Optional[dict] = None
    severity: str = Field(default="warning", pattern="^(warning|critical)$")
    is_active: bool = True


class RuleCreate(RuleBase):
    dataset_id: int


class RuleUpdate(BaseModel):
    rule_name: Optional[str] = None
    rule_type: Optional[str] = None
    column_name: Optional[str] = None
    params_json: Optional[dict] = None
    severity: Optional[str] = None
    is_active: Optional[bool] = None


class RuleResponse(RuleBase):
    id: int
    dataset_id: int
    created_at: datetime

    class Config:
        from_attributes = True
