# Архитектура data-quality-spark

## Обзор

Платформа для проверки качества данных. Backend на FastAPI + Apache Spark, frontend на Next.js.

## Компоненты

- **rule_manager** — CRUD правил качества данных
- **execution_engine** — запуск проверок через Spark
- **exporter** — экспорт результатов в CSV

## Поток данных

1. Пользователь создаёт правило через UI или API
2. Запускается execution — Spark читает CSV из `sample_data/`
3. Результаты сохраняются и доступны для экспорта

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | Next.js, React, TypeScript |
| Backend | FastAPI, Pydantic, SQLAlchemy |
| Вычисления | Apache Spark |
| БД | PostgreSQL, Alembic |
| Инфра | Docker Compose |