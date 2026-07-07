from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.database import get_db
from app.models.run import Run
from app.models.dataset import Dataset
from app.schemas.run import RunCreate, RunResponse, RunDetailResponse
from app.schemas.run_analysis import RunAnalysisResponse
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from app.services.execution_engine import run_quality_checks
from app.services.llm_result_analyzer import (
    OllamaUnavailableError,
    RunNotReadyForAnalysisError,
    analyze_run,
    get_cached_analysis,
)
import threading

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
def execute_run(run_id: int, background_tasks: BackgroundTasks = None):
    """
    Запускает проверку качества для существующего run.
    Пока в отдельном потоке (простой вариант).
    """
    from fastapi import BackgroundTasks

    # Запускаем в фоне
    thread = threading.Thread(target=run_quality_checks, args=(run_id,))
    thread.start()

    return {"message": f"Quality check for run {run_id} started in background"}
