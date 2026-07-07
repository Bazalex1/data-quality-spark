from datetime import datetime
from pydantic import BaseModel
from typing import Optional, Any


class ResultResponse(BaseModel):
    id: int
    run_id: int
    rule_id: int
    passed: bool
    failed_count: int
    details_json: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True
