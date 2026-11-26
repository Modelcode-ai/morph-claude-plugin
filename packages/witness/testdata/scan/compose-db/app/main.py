import os

from fastapi import FastAPI

app = FastAPI()
DATABASE_URL = os.environ["DATABASE_URL"]


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/items")
def items():
    return []
