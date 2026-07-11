import threading
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.dataset import Dataset
from app.models.run import Run
from app.schemas.run import RunCreate, RunResponse, RunDetailResponse
from app.schemas.run_analysis import RunAnalysisResponse
from app.services.execution_engine import run_quality_checks
from app.services.exporter import ExportError, SUPPORTED_FORMATS, export_run
from app.services.llm_result_analyzer import (
    OllamaUnavailableError,
    RunNotReadyForAnalysisError,
    analyze_run,
    get_cached_analysis,
)

router = APIRouter(prefix="/runs", tags=["Runs"])


@router.post("/", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
def create_run(run: RunCreate, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == run.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    db_run = Run(dataset_id=run.dataset_id, status="pending")
    db.add(db_run)
    db.commit()
    db.refresh(db_run)
    return db_run


@router.get("/", response_model=List[RunResponse])
def get_runs(dataset_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Run)
    if dataset_id:
        query = query.filter(Run.dataset_id == dataset_id)
    return query.order_by(Run.started_at.desc()).all()


@router.get("/{run_id}", response_model=RunDetailResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = (
        db.query(Run).options(joinedload(Run.results)).filter(Run.id == run_id).first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/{run_id}/export")
def export_run_report(
    run_id: int,
    format: str = Query("json", description=f"One of: {', '.join(SUPPORTED_FORMATS)}"),
    db: Session = Depends(get_db),
):
    """Экспорт итогового протокола: json | csv | html | pdf."""
    try:
        content, media_type, ext, _path = export_run(db, run_id, format, persist=True)
    except ExportError as exc:
        message = str(exc)
        if message == "Run not found":
            raise HTTPException(status_code=404, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc

    filename = f"run_{run_id}.{ext}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{run_id}/analysis", response_model=RunAnalysisResponse)
def get_run_analysis(run_id: int, db: Session = Depends(get_db)):
    try:
        analysis = get_cached_analysis(db, run_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunAnalysisResponse(
        run_id=run_id,
        analysis=analysis,
        cached=analysis is not None,
    )


@router.post("/{run_id}/analyze", response_model=RunAnalysisResponse)
async def create_run_analysis(run_id: int, db: Session = Depends(get_db)):
    try:
        analysis, cached = await analyze_run(db, run_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Run not found")
    except RunNotReadyForAnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return RunAnalysisResponse(
        run_id=run_id,
        analysis=analysis,
        cached=cached,
    )


@router.post("/{run_id}/execute")
def execute_run(run_id: int, db: Session = Depends(get_db)):
    """
    Запускает проверку качества для существующего run.
    Выполняется в отдельном потоке (простой вариант для практики).
    """
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    thread = threading.Thread(target=run_quality_checks, args=(run_id,), daemon=True)
    thread.start()

    return {"message": f"Quality check for run {run_id} started in background"}
