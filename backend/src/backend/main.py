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

# Backend interchange point:
# The MERN backend in mern-backend/ should expose the same /api/v1/schematics
# contract. The Next.js frontend can switch between this FastAPI/FARM app and
# the Express/MERN app by changing BACKEND_API_BASE_URL.
app.include_router(schematics_router)

@app.get("/")
def read_root():
    return {"name": "Audrolics API", "status": "ok"}
