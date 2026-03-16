"""
CollabCode API  –  v1
All routes are versioned under /api/v1/
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from core.database import init_db
from core.redis_client import close_redis
from core.config import get_settings
from core.security import limiter
from routers import auth, workspace, files, chat, collaboration, terminal, oauth
import models

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print("Database initialised")
    yield
    await close_redis()


app = FastAPI(
    title="CollabCode API",
    version="1.0.0",
    # Hide schema endpoints in production (set via env)
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── Rate-limit middleware ─────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS — locked to explicit origins, NOT wildcard ──────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,   # ["http://localhost:5173"] in dev
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Security headers middleware ────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"]    = "nosniff"
    response.headers["X-Frame-Options"]           = "DENY"
    response.headers["X-XSS-Protection"]          = "1; mode=block"
    response.headers["Referrer-Policy"]           = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]        = "geolocation=(), microphone=(), camera=()"
    # Only set HSTS in production
    # response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response

# ── All routers versioned under /api/v1 ───────────────────────────────
PREFIX = settings.API_V1_PREFIX   # "/api/v1"

app.include_router(auth.router,          prefix=PREFIX)
app.include_router(workspace.router,     prefix=PREFIX)
app.include_router(files.router,         prefix=PREFIX)
app.include_router(chat.router,          prefix=PREFIX)
app.include_router(collaboration.router, prefix=PREFIX)
app.include_router(terminal.router,      prefix=PREFIX)
app.include_router(oauth.router,          prefix=PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get(f"{PREFIX}/health")
async def health_v1():
    return {"status": "ok", "api": "v1"}
