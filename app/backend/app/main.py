from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, canvas


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

# CORS - allow the frontend dev server(s) defined in .env to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers (placeholders for now)
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(canvas.router, prefix=settings.API_V1_PREFIX)

@app.get("/", tags=["root"])
async def root() -> dict[str, str]:
    return {"message": f"{settings.PROJECT_NAME} is running."}

@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
