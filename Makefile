.PHONY: up down build test migrate

up:
	docker compose up --build

down:
	docker compose down

build:
	docker compose build

test:
	cd backend && pytest

migrate:
	cd backend && alembic upgrade head