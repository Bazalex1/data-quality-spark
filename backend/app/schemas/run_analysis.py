from pydantic import BaseModel


class RunAnalysisResponse(BaseModel):
    run_id: int
    analysis: str | None = None
    cached: bool = False