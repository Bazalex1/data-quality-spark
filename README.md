# data-quality-spark

Платформа проверки качества данных на Apache Spark.

## Структура

```
data-quality-spark/
├── backend/          # FastAPI + Spark
├── frontend/         # Next.js
├── examples/         # Примеры интеграции
├── docs/             # Документация
├── sample_data/      # Демо CSV с ошибками
├── docker-compose.yml
└── Makefile
```

## Быстрый старт

```bash
# Запуск всех сервисов
make up

# Или вручную
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs
- PostgreSQL: localhost:5432

## Локальная разработка

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Тесты

```bash
make test
```

## Пример пайплайна

```bash
python examples/pipeline_integration.py
```