from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.core.database import Base, engine
from app.routers import auth, canvas

# Import all models so SQLAlchemy registers them with Base.metadata
# before create_all runs on startup. Without these imports the tables
# won't be created even though the model files exist.
import app.models.user             # noqa: F401
import app.models.course           # noqa: F401
import app.models.assignment       # noqa: F401
import app.models.submission       # noqa: F401
import app.models.conversation     # noqa: F401
import app.models.message          # noqa: F401
import app.models.workflow         # noqa: F401
import app.models.audit_log        # noqa: F401
import app.models.message_template # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(canvas.router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["root"])
async def root() -> dict[str, str]:
    return {"message": f"{settings.PROJECT_NAME} is running."}


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}