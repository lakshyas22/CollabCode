"""
OAuth router — Google + GitHub
──────────────────────────────
Google flow  (ID-token popup via GSI):
  POST /auth/oauth/google          { credential: <id_token> } → JWT

Google flow  (server-side redirect):
  GET  /auth/oauth/google/login    → redirect to Google consent
  GET  /auth/oauth/google/callback → exchange code → redirect frontend

GitHub flow  (server-side redirect):
  GET  /auth/oauth/github          → redirect to GitHub consent
  GET  /auth/oauth/github/callback → exchange code → redirect frontend
"""
import httpx, bcrypt, secrets, urllib.parse as up
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import timedelta
from core.database import get_db
from core.auth import create_access_token
from core.config import get_settings
from core.security import limiter, sanitise_name
from models.user import User

router   = APIRouter(prefix="/auth", tags=["oauth"])
settings = get_settings()

GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USER_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"
GITHUB_AUTH_URL  = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL  = "https://api.github.com/user"
GITHUB_EMAIL_URL = "https://api.github.com/user/emails"


# ── Shared helpers ─────────────────────────────────────────────────────

def _jwt(user: User) -> dict:
    token = create_access_token(
        {"sub": str(user.id)},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "access_token": token, "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email,
                 "created_at": user.created_at.isoformat()},
    }

async def _upsert(db: AsyncSession, email: str, name: str) -> User:
    email = email.lower().strip()
    r = await db.execute(select(User).where(User.email == email))
    u = r.scalar_one_or_none()
    if not u:
        u = User(
            name=sanitise_name(name or email.split("@")[0], max_len=100),
            email=email,
            password_hash=bcrypt.hashpw(secrets.token_hex(32).encode(), bcrypt.gensalt()).decode(),
        )
        db.add(u); await db.flush(); await db.refresh(u)
    return u

def _setup_page(provider: str, steps: list[str], redirect_uri: str = "") -> HTMLResponse:
    """Pretty HTML setup instructions page when OAuth credentials are missing."""
    steps_html = "".join(f"<li>{s}</li>" for s in steps)
    return HTMLResponse(f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>{provider} OAuth Setup · CollabCode</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0b0f;color:#e8ecf5;
        display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}}
  .card{{max-width:520px;width:100%;background:#0d0f18;border:1px solid #1a1f30;border-radius:14px;padding:40px 36px}}
  h2{{font-size:20px;font-weight:700;margin-bottom:8px}}
  .sub{{color:#9aa3be;font-size:14px;margin-bottom:28px;line-height:1.5}}
  ol{{padding-left:20px;color:#9aa3be;font-size:13px;line-height:2}}
  li{{margin-bottom:4px}}
  code{{background:#161b28;color:#38e2ff;padding:2px 8px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:12px}}
  .uri{{background:#161b28;border:1px solid #252b3d;border-radius:8px;padding:12px 16px;
        font-family:'JetBrains Mono',monospace;font-size:13px;color:#2cf59e;
        margin:16px 0;word-break:break-all}}
  .env{{background:#0a0b0f;border:1px solid #1a1f30;border-radius:8px;padding:14px 16px;
        font-family:'JetBrains Mono',monospace;font-size:12px;color:#c8cde3;margin:16px 0;line-height:1.8}}
  .comment{{color:#3a4460}}
  .key{{color:#38e2ff}}
  .val{{color:#2cf59e}}
  .btn{{display:inline-block;margin-top:24px;padding:11px 28px;
        background:linear-gradient(135deg,#38e2ff,#a259ff);
        color:#000;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px}}
  .icon{{font-size:40px;margin-bottom:18px}}
</style></head><body>
<div class="card">
  <div class="icon">🔑</div>
  <h2>{provider} OAuth — Setup Required</h2>
  <p class="sub">
    {provider} login needs credentials added to your <code>.env</code> file.
    This takes about 2 minutes.
  </p>
  <ol>{steps_html}</ol>
  {"<p style='margin-top:16px;font-size:13px;color:#9aa3be'>Use this as the callback URL:</p><div class='uri'>" + redirect_uri + "</div>" if redirect_uri else ""}
  <p style="margin-top:20px;font-size:13px;color:#9aa3be">Then add to <code>.env</code> and rebuild:</p>
  <div class="env">{_env_block(provider)}</div>
  <p style="margin-top:16px;font-size:12px;color:#9aa3be">After editing <code>.env</code>, run:
    <code style="display:block;margin-top:6px">docker compose build --no-cache &amp;&amp; docker compose up</code>
  </p>
  <a class="btn" href="http://localhost:5173/login">← Back to Login</a>
</div></body></html>""")

def _env_block(provider: str) -> str:
    if provider == "Google":
        return ('<span class="comment"># Google OAuth</span>\n'
                '<span class="key">GOOGLE_CLIENT_ID</span>=<span class="val">your_client_id_here</span>\n'
                '<span class="key">GOOGLE_CLIENT_SECRET</span>=<span class="val">your_client_secret_here</span>')
    return ('<span class="comment"># GitHub OAuth</span>\n'
            '<span class="key">GITHUB_CLIENT_ID</span>=<span class="val">your_client_id_here</span>\n'
            '<span class="key">GITHUB_CLIENT_SECRET</span>=<span class="val">your_client_secret_here</span>')


# ── Google: GSI id-token (POST) ────────────────────────────────────────

class GoogleTokenReq(BaseModel):
    credential: str

@router.post("/oauth/google")
@limiter.limit("20/minute")
async def google_post(request: Request, data: GoogleTokenReq, db: AsyncSession = Depends(get_db)):
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(GOOGLE_TINFO_URL, params={"id_token": data.credential})
    if r.status_code != 200 or r.json().get("error"):
        raise HTTPException(401, "Invalid Google token.")
    info  = r.json()
    email = info.get("email", "").lower()
    name  = info.get("name") or info.get("given_name") or email.split("@")[0]
    if not email or not info.get("email_verified"):
        raise HTTPException(400, "Google account has no verified email.")
    if settings.GOOGLE_CLIENT_ID and info.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(401, "Token audience mismatch.")
    user = await _upsert(db, email, name)
    await db.commit()
    return _jwt(user)


# ── Google: server-side redirect (GET) ────────────────────────────────

@router.get("/oauth/google/login")
async def google_login():
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        return _setup_page(
            "Google",
            [
                "Go to <a href='https://console.cloud.google.com' target='_blank' style='color:#38e2ff'>console.cloud.google.com</a>",
                "APIs &amp; Services → Credentials → <b>Create OAuth 2.0 Client ID</b>",
                "Application type: <b>Web application</b>",
                "Authorized redirect URIs → Add the callback URL below",
                "Copy your <b>Client ID</b> and <b>Client Secret</b> into <code>.env</code>",
            ],
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
        )
    params = {
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "redirect_uri":  settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "online",
        "prompt":        "select_account",
    }
    return RedirectResponse(GOOGLE_AUTH_URL + "?" + up.urlencode(params))

@router.get("/oauth/google/callback")
async def google_callback(request: Request, code: str = "", error: str = "", db: AsyncSession = Depends(get_db)):
    fe = settings.FRONTEND_URL
    if error or not code:
        return RedirectResponse(f"{fe}/login?error=google_denied")
    async with httpx.AsyncClient(timeout=15) as c:
        tr = await c.post(GOOGLE_TOKEN_URL, data={
            "code": code, "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI, "grant_type": "authorization_code",
        })
        if tr.status_code != 200 or not tr.json().get("access_token"):
            return RedirectResponse(f"{fe}/login?error=google_token_failed")
        ur = await c.get(GOOGLE_USER_URL, headers={"Authorization": f"Bearer {tr.json()['access_token']}"})
    if ur.status_code != 200:
        return RedirectResponse(f"{fe}/login?error=google_user_failed")
    info  = ur.json()
    email = info.get("email", "").lower()
    name  = info.get("name") or info.get("given_name") or email.split("@")[0]
    if not email or not info.get("email_verified"):
        return RedirectResponse(f"{fe}/login?error=google_no_email")
    try:
        user = await _upsert(db, email, name); await db.commit()
        return RedirectResponse(f"{fe}/oauth/callback?token={_jwt(user)['access_token']}&provider=google")
    except Exception:
        return RedirectResponse(f"{fe}/login?error=google_server_error")


# ── GitHub: server-side redirect (GET) ────────────────────────────────

@router.get("/oauth/github")
async def github_login():
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        return _setup_page(
            "GitHub",
            [
                "Go to <a href='https://github.com/settings/developers' target='_blank' style='color:#38e2ff'>github.com/settings/developers</a>",
                "OAuth Apps → <b>New OAuth App</b>",
                "Homepage URL: <code>http://localhost:5173</code>",
                "Authorization callback URL: add the callback URL below",
                "Click <b>Register application</b>, then generate a <b>Client Secret</b>",
                "Copy both values into <code>.env</code>",
            ],
            redirect_uri=settings.GITHUB_REDIRECT_URI,
        )
    params = {
        "client_id":    settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope":        "user:email read:user",
    }
    return RedirectResponse(GITHUB_AUTH_URL + "?" + up.urlencode(params))

@router.get("/oauth/github/callback")
async def github_callback(request: Request, code: str = "", error: str = "", db: AsyncSession = Depends(get_db)):
    fe = settings.FRONTEND_URL
    if error or not code:
        return RedirectResponse(f"{fe}/login?error=github_denied")
    async with httpx.AsyncClient(timeout=15) as c:
        tr = await c.post(GITHUB_TOKEN_URL, json={
            "client_id": settings.GITHUB_CLIENT_ID, "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code, "redirect_uri": settings.GITHUB_REDIRECT_URI,
        }, headers={"Accept": "application/json"})
        if tr.status_code != 200 or not tr.json().get("access_token"):
            return RedirectResponse(f"{fe}/login?error=github_token_failed")
        gh_token = tr.json()["access_token"]
        hdrs = {"Authorization": f"Bearer {gh_token}", "Accept": "application/vnd.github+json"}
        ur = await c.get(GITHUB_USER_URL, headers=hdrs)
        er = await c.get(GITHUB_EMAIL_URL, headers=hdrs)
    if ur.status_code != 200:
        return RedirectResponse(f"{fe}/login?error=github_user_failed")
    gh   = ur.json()
    name = gh.get("name") or gh.get("login") or "GitHub User"
    email = None
    if er.status_code == 200:
        for e in er.json():
            if e.get("primary") and e.get("verified"): email = e["email"]; break
        if not email:
            for e in er.json():
                if e.get("verified"): email = e["email"]; break
    email = email or gh.get("email")
    if not email:
        return RedirectResponse(f"{fe}/login?error=github_no_email")
    try:
        user = await _upsert(db, email, name); await db.commit()
        return RedirectResponse(f"{fe}/oauth/callback?token={_jwt(user)['access_token']}&provider=github")
    except Exception:
        return RedirectResponse(f"{fe}/login?error=github_server_error")
