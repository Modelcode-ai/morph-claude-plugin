.PHONY: serve migrate test

serve:
	uvicorn app.main:app --reload

migrate:
	alembic upgrade head

test:
	pytest
