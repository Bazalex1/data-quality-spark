# Архитектура data-quality-spark

## Обзор

Платформа для проверки качества данных. Backend на FastAPI + Apache Spark, frontend на Next.js.

## Компоненты

- **rule_manager** — CRUD правил качества данных
- **execution_engine** — запуск проверок через Spark
- **exporter** — экспорт результатов в CSV


## Стек

| Слой | Технологии |
|------|------------|
| Frontend | Next.js, React, TypeScript |
| Backend | FastAPI, Pydantic, SQLAlchemy |
| Вычисления | Apache Spark |
| БД | PostgreSQL, Alembic |
| Инфра | Docker Compose |


### 2. Правила качества

| Тип | Что проверяет |
|-----|----------------|
| `not_null` | Колонка не пустая |
| `unique` | Значения уникальны |
| `min_max` | Число в диапазоне min–max |
| `not_equal` / `not_zero` | Значение не должно быть равно X |
| `regex_match` | Строка подходит под регулярку |
| `accepted_values` | Значение из списка допустимых |
| `freshness` | max(timestamp) не старше N часов/дней |
| `null_percent` | Доля NULL не выше порога |
| `date_not_future` | Дата/время не в будущем |
| `row_count` | Число строк в файле в пределах |
| `schema_match` | Есть нужные колонки |
| `custom_sql` | Spark SQL condition для «плохих» строк |


## Стек технологий

| Часть | Технологии |
|-------|------------|
| Frontend | Next.js 16, React, TypeScript, TanStack Query, Tailwind, shadcn/ui, Recharts |
| Backend | FastAPI, SQLAlchemy, Pydantic, Alembic |
| Проверки | Apache Spark (PySpark), local master |
| БД | PostgreSQL |
| AI | Ollama (локально, qwen3:8b ) |
| Инфра | Docker Compose |


## API (основные эндпоинты)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET/POST | `/datasets/` | Список / создание |
| POST | `/datasets/upload` | Загрузка CSV |
| GET | `/datasets/{id}/columns` | Колонки файла |
| GET/POST | `/rules/` | Правила |
| GET/POST | `/runs/` | Запуски |
| GET | `/runs/{id}` | Run + results |
| POST | `/runs/{id}/execute` | Старт Spark-проверки |
| GET | `/runs/{id}/analysis` | Сохранённый AI-отчёт |
| POST | `/runs/{id}/analyze` | Генерация AI-отчёта |
| GET | `/runs/{id}/export?format=` | Экспорт json/csv/html/pdf |

Документация Swagger: http://localhost:8000/docs