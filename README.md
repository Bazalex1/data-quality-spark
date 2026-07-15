# Data Quality Spark

Сервис проверки качества данных на **Spark** с веб-интерфейсом, REST API и AI-анализом результатов.

---

## Быстрый старт

```bash
# Backend + PostgreSQL
docker compose up -d

# Frontend
cd frontend && npm install && npm run dev
```

| Сервис | URL |
|--------|-----|
| Frontend | http://localhost:3000 |
| Backend API / Swagger | http://localhost:8000/docs |
| PostgreSQL | localhost:**5433** |

### Ollama (AI-анализ)

```bash
ollama pull qwen3:8b 
```

Ollama должна быть запущена на хосте. Backend в Docker обращается к ней через `host.docker.internal:11434`.

---

## Структура проекта

```
data-quality-spark/
├── backend/          # FastAPI, Spark execution_engine, LLM-анализатор
├── frontend/         # Next.js UI (дашборд, датасеты, правила, запуски)
├── examples/         # Airflow DAG, pipeline_integration.py
├── data/             # CSV-файлы (volume для Docker)
├── docs/             # Техническая архитектура
└── docker-compose.yml
```

---

## Основной сценарий

1. Создать **датасет** (путь к CSV или upload)
2. Настроить **правила** (`not_null`, `unique`, `min_max`, …)
3. Создать и **запустить run** — Spark проверяет файл
4. Смотреть результаты, экспорт, **AI-анализ** на странице run

---

## Примеры интеграции

```bash
# Airflow DAG (или как скрипт)
set DATASET_ID=1
python examples/airflow_dag_example.py
```

---

## Разработка

```bash
# Backend локально
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

# Миграции
cd backend && alembic upgrade head

# Тесты
make test
```

---

## Стек

- **Frontend:** Next.js, React, TypeScript, TanStack Query, Tailwind, Recharts
- **Backend:** FastAPI, SQLAlchemy, PySpark, Alembic
- **БД:** PostgreSQL
- **AI:** Ollama (локальные LLM)
- **Инфра:** Docker Compose