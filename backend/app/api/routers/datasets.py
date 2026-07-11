import csv
import json
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetCreate, DatasetUpdate, DatasetResponse
from app.services.execution_engine import (
    get_spark_session,
    load_dataset_dataframe,
    parse_source_config,
    resolve_read_format,
)

router = APIRouter(prefix="/datasets", tags=["Datasets"])

UPLOAD_DIR = Path("/data/uploads")


def _safe_filename(filename: str) -> str:
    name = Path(filename).name
    name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
    return name or "upload.csv"


def _resolve_dataset_path(source_config_json: str | None) -> str | None:
    config = parse_source_config(source_config_json)
    path = config.get("path")
    return str(path) if path else None


def _read_csv_columns(file_path: str) -> list[str]:
    with open(file_path, newline="", encoding="utf-8-sig") as csv_file:
        reader = csv.reader(csv_file)
        headers = next(reader, [])

    columns = [column.strip() for column in headers if column and column.strip()]
    if not columns:
        raise HTTPException(status_code=400, detail="CSV file has no columns")
    return columns


def _read_columns_via_spark(dataset: Dataset) -> list[str]:
    spark = None
    try:
        spark = get_spark_session()
        df = load_dataset_dataframe(spark, dataset)
        columns = list(df.columns)
        if not columns:
            raise HTTPException(status_code=400, detail="Dataset has no columns")
        return columns
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Failed to read dataset columns: {exc}"
        ) from exc
    finally:
        if spark:
            spark.stop()


@router.post("/upload")
async def upload_dataset_file(file: UploadFile = File(...)):
    """Загружает CSV-файл в /data/uploads и возвращает путь для source_config_json."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported for upload")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    destination = UPLOAD_DIR / unique_name

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    destination.write_bytes(content)

    container_path = f"/data/uploads/{unique_name}"
    return {
        "path": container_path,
        "filename": unique_name,
        "original_filename": file.filename,
        "format": "csv",
    }


@router.post("/", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def create_dataset(dataset: DatasetCreate, db: Session = Depends(get_db)):
    existing = db.query(Dataset).filter(Dataset.name == dataset.name).first()
    if existing:
        raise HTTPException(
            status_code=400, detail="Dataset with this name already exists"
        )

    db_dataset = Dataset(**dataset.model_dump())
    db.add(db_dataset)
    db.commit()
    db.refresh(db_dataset)
    return db_dataset


@router.get("/", response_model=List[DatasetResponse])
def get_datasets(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Dataset).offset(skip).limit(limit).all()


@router.get("/{dataset_id}/columns")
def get_dataset_columns(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    file_path = _resolve_dataset_path(dataset.source_config_json)
    if not file_path:
        raise HTTPException(status_code=404, detail="Dataset file path is not configured")

    if not Path(file_path).exists():
        raise HTTPException(status_code=404, detail=f"Dataset file not found: {file_path}")

    config = parse_source_config(dataset.source_config_json)
    fmt = resolve_read_format(dataset.source_type, config)

    # CSV читаем без Spark (быстрее); parquet/json/orc — через Spark
    if fmt == "csv" and Path(file_path).is_file():
        return {"columns": _read_csv_columns(file_path), "format": fmt}

    return {"columns": _read_columns_via_spark(dataset), "format": fmt}


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.put("/{dataset_id}", response_model=DatasetResponse)
def update_dataset(
    dataset_id: int, dataset_update: DatasetUpdate, db: Session = Depends(get_db)
):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    update_data = dataset_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(dataset, key, value)

    db.commit()
    db.refresh(dataset)
    return dataset


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    db.delete(dataset)
    db.commit()
    return None
