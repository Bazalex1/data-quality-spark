import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetCreate, DatasetUpdate, DatasetResponse

router = APIRouter(prefix="/datasets", tags=["Datasets"])

UPLOAD_DIR = Path("/data/uploads")


def _safe_filename(filename: str) -> str:
    name = Path(filename).name
    name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
    return name or "upload.csv"


@router.post("/upload")
async def upload_dataset_file(file: UploadFile = File(...)):
    """Загружает CSV-файл в /data/uploads и возвращает путь для source_config_json."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

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
    }


@router.post("/", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def create_dataset(dataset: DatasetCreate, db: Session = Depends(get_db)):
    # Проверка на уникальность имени
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
