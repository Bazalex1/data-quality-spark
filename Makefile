.PHONY: up down build logs test migrate

# Full stack: postgres + backend + frontend (only Docker required)
up:
	docker compose up --build

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

test:
	cd backend && pytest

migrate:
	cd backend && alembic upgrade head