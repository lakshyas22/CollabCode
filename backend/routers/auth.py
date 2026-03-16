"""
Auth router  — /api/v1/auth/...
Rate limits applied per IP to prevent brute-force / credential stuffing.
Password validated server-side (8+ chars, uppercase, lowercase, digit, special).
All user input sanitised before touching the DB.
SQLAlchemy parameterised queries prevent SQL injection throughout.
"""
import re
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr, field_validator
from core.database import get_db
from core.auth import hash_password, verify_password, create_access_token, get_current_user
from core.config import get_settings
from core.security import limiter, sanitise_name
from models.user import User

router  = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


# ── Password rules (mirrors frontend) ─────────────────────────────────
def validate_password(pw: str) -> list[str]:
    errors = []
    if not isinstance(pw, str):
        return ["Password must be a string."]
    if len(pw) < 8:
        errors.append("At least 8 characters required.")
    if not re.search(r"[A-Z]", pw):
        errors.append("Must include at least one uppercase letter (A–Z).")
    if not re.search(r"[a-z]", pw):
        errors.append("Must include at least one lowercase letter (a–z).")
    if not re.search(r"\d", pw):
        errors.append("Must include at least one digit (0–9).")
    if not re.search(r"""[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]""", pw):
        errors.append("Must include at least one special character (!@#$%^&* etc).")
    return errors


# ── Schemas ────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    name:     str
    email:    EmailStr
    password: str

    # Pydantic v2 validators — fire before the endpoint even runs
    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = sanitise_name(v, max_len=100)
        if not v:
            raise ValueError("Full name is required.")
        return v

    @field_validator("password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        errs = validate_password(v)
        if errs:
            # Raise as a single combined message; frontend parses this
            raise ValueError(" | ".join(errs))
        return v


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class UpdateMeRequest(BaseModel):
    name:     str | None = None
    password: str | None = None


class UserResponse(BaseModel):
    id:         int
    name:       str
    email:      str
    created_at: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserResponse


# ── Helpers ────────────────────────────────────────────────────────────
def _user_resp(u: User) -> UserResponse:
    return UserResponse(id=u.id, name=u.name, email=u.email, created_at=u.created_at.isoformat())


# ── Routes ─────────────────────────────────────────────────────────────

# Rate limit: max 10 signup attempts per IP per minute
@router.post("/signup", response_model=TokenResponse, status_code=201)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def signup(request: Request, data: SignupRequest, db: AsyncSession = Depends(get_db)):
    # Duplicate e-mail — uses parameterised query (ORM), safe from SQLi
    existing = await db.execute(select(User).where(User.email == data.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user = User(
        name=data.name,
        email=data.email.lower(),
        password_hash=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token = create_access_token(
        {"sub": str(user.id)},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(access_token=token, user=_user_resp(user))


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Constant-time comparison happens inside verify_password (bcrypt)
    result = await db.execute(select(User).where(User.email == data.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        # Generic message — do NOT reveal whether email exists
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(
        {"sub": str(user.id)},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(access_token=token, user=_user_resp(user))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return _user_resp(current_user)


@router.put("/me", response_model=UserResponse)
@limiter.limit("20/minute")
async def update_me(
    request: Request,
    data: UpdateMeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.name is not None:
        name = sanitise_name(data.name, max_len=100)
        if not name:
            raise HTTPException(status_code=400, detail="Name must not be empty.")
        current_user.name = name

    if data.password is not None:
        errs = validate_password(data.password)
        if errs:
            raise HTTPException(status_code=422, detail={"message": "Weak password.", "errors": errs})
        current_user.password_hash = hash_password(data.password)

    await db.flush()
    await db.refresh(current_user)
    return _user_resp(current_user)
