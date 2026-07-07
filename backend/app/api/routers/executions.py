from fastapi import APIRouter, Depends, HTTPException

from app.schemas.execution import ExecutionCreate, ExecutionRead
from app.services.execution_engine import ExecutionEngine

router = APIRouter(prefix="/executions", tags=["executions"])


def get_execution_engine() -> ExecutionEngine:
    return ExecutionEngine()


@router.get("/", response_model=list[ExecutionRead])
def list_executions(engine: ExecutionEngine = Depends(get_execution_engine)):
    return engine.list_executions()


@router.post("/", response_model=ExecutionRead, status_code=201)
def run_execution(
    payload: ExecutionCreate,
    engine: ExecutionEngine = Depends(get_execution_engine),
):
    return engine.run(payload)


@router.get("/{execution_id}", response_model=ExecutionRead)
def get_execution(
    execution_id: int,
    engine: ExecutionEngine = Depends(get_execution_engine),
):
    execution = engine.get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution