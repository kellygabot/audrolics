from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes.schematics import router as schematics_router

app = FastAPI(title="Audrolics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(schematics_router)

@app.get("/")
def read_root():
    return {"name": "Audrolics API", "status": "ok"}
