from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from app.services.exporter import Exporter

router = APIRouter(prefix="/exports", tags=["exports"])


def get_exporter() -> Exporter:
    return Exporter()


@router.get("/{execution_id}")
def export_execution(
    execution_id: int,
    exporter: Exporter = Depends(get_exporter),
):
    report = exporter.export_execution(execution_id)
    if not report:
        raise HTTPException(status_code=404, detail="Execution not found")
    return PlainTextResponse(content=report, media_type="text/csv")