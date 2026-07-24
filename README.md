# Data Quality Spark

Сервис проверки качества данных на **Spark** с веб-интерфейсом, REST API и AI-анализом результатов.

Описание архитектуры лежит в docs/architecture.md

---

## Быстрый старт

Нужен только **Docker** (Docker Compose). Node.js и Python на хосте не обязательны.

```bash
docker compose up --build
```

Или через Makefile:

```bash
make up
```

| Сервис | URL |
|--------|-----|
| Frontend | http://localhost:3000 |
| Backend API / Swagger | http://localhost:8000/docs |
| PostgreSQL | localhost:**5433** |

Остановка:

```bash
docker compose down
# или
make down
```

### Ollama (AI-анализ, опционально)
(Необязательно, для работы сервиса)
```bash
ollama pull qwen3:8b
```

Ollama должна быть запущена на хосте. Backend в Docker обращается к ней через `host.docker.internal:11434`.

---

## Структура проекта

```
data-quality-spark/
├── backend/           # FastAPI, Spark execution_engine, LLM-анализатор
├── frontend/          # Next.js UI (дашборд, датасеты, правила, запуски)
├── examples/          # Airflow DAG, pipeline_integration.py
├── data/              # CSV-файлы (volume для Docker)
├── docs/              # Техническая архитектура
└── docker-compose.yml # postgres + backend + frontend
```

---

## Основной сценарий
(Иллюстрирующие скриншоты лежат в папке docs/)
1. Создать **датасет** (путь к CSV или upload)
2. Настроить **правила** (`not_null`, `unique`, `min_max`, …)
3. Создать и **запустить run** — Spark проверяет файл
4. Смотреть результаты, экспорт, **AI-анализ** на странице run

---

## Примеры интеграции с Airflow

```bash
# Airflow DAG (или как скрипт)
set DATASET_ID=1
python examples/airflow_dag_example.py
```

---

## Разработка (без Docker)

```bash
# Backend локально (нужен Python + Postgres)
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

# Frontend локально (нужен Node.js)
cd frontend && npm install && npm run dev

# Миграции
cd backend && alembic upgrade head
```

---
