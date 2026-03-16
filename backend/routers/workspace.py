"""
Workspace router  — /api/v1/workspace/...
Security:
  - Workspace names sanitised
  - Invite role validated against whitelist
  - All DB queries parameterised via ORM
  - Rate limits on create/invite
"""
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from core.database import get_db
from core.auth import get_current_user
from core.config import get_settings
from core.security import limiter, sanitise_name
from models.user import User
from models.workspace import Workspace, WorkspaceMember, MemberRole
from models.file import File

router   = APIRouter(prefix="/workspace", tags=["workspace"])
settings = get_settings()

ALLOWED_ROLES = {r.value for r in MemberRole} - {"owner"}  # can't invite as owner


class CreateWorkspaceRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def clean(cls, v: str) -> str:
        v = sanitise_name(v, max_len=settings.MAX_WORKSPACE_NAME_LEN)
        if not v:
            raise ValueError("Workspace name must not be empty.")
        return v


class InviteRequest(BaseModel):
    email: EmailStr
    role:  Optional[str] = "editor"

    @field_validator("role")
    @classmethod
    def clean_role(cls, v: str) -> str:
        v = (v or "editor").lower().strip()
        return v if v in ALLOWED_ROLES else "editor"


class MemberResponse(BaseModel):
    id:      int
    user_id: int
    name:    str
    email:   str
    role:    str


class WorkspaceResponse(BaseModel):
    id:           int
    name:         str
    owner_id:     int
    invite_token: str
    created_at:   str
    members:      list[MemberResponse] = []
    file_count:   int                  = 0


def _member_resp(m: WorkspaceMember) -> MemberResponse:
    return MemberResponse(id=m.id, user_id=m.user_id, name=m.user.name, email=m.user.email, role=m.role.value)


def _ws_resp(ws: Workspace, file_count: int = 0) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=ws.id, name=ws.name, owner_id=ws.owner_id,
        invite_token=ws.invite_token, created_at=ws.created_at.isoformat(),
        members=[_member_resp(m) for m in ws.members], file_count=file_count,
    )


async def _load_ws(workspace_id: int, db: AsyncSession) -> Workspace:
    r = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.members).selectinload(WorkspaceMember.user))
        .where(Workspace.id == workspace_id)
    )
    ws = r.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


@router.post("", response_model=WorkspaceResponse, status_code=201)
@limiter.limit("10/minute")
async def create_workspace(
    request:      Request,
    data:         CreateWorkspaceRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
    skip_default: bool         = False,
):
    ws = Workspace(name=data.name, owner_id=current_user.id, invite_token=secrets.token_urlsafe(32))
    db.add(ws)
    await db.flush()

    db.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role=MemberRole.owner))
    if not skip_default:
        db.add(File(
            workspace_id=ws.id, name="main.py", language="python",
            content="# Welcome to CollabCode!\n\ndef main():\n    print('Hello, World!')\n\nif __name__ == '__main__':\n    main()\n",
        ))
    await db.flush()
    return _ws_resp(await _load_ws(ws.id, db))


@router.get("/my", response_model=list[WorkspaceResponse])
@limiter.limit(settings.RATE_LIMIT_API)
async def list_my_workspaces(
    request:      Request,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    r = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .options(selectinload(Workspace.members).selectinload(WorkspaceMember.user))
        .where(WorkspaceMember.user_id == current_user.id)
        .order_by(Workspace.created_at.desc())
    )
    out = []
    for ws in r.scalars().all():
        fc = await db.execute(select(File).where(File.workspace_id == ws.id))
        out.append(_ws_resp(ws, len(fc.scalars().all())))
    return out


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
@limiter.limit(settings.RATE_LIMIT_API)
async def get_workspace(
    request:      Request,
    workspace_id: int,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    ws = await _load_ws(workspace_id, db)
    if current_user.id not in [m.user_id for m in ws.members]:
        raise HTTPException(status_code=403, detail="Access denied")
    fc = await db.execute(select(File).where(File.workspace_id == ws.id))
    return _ws_resp(ws, len(fc.scalars().all()))


@router.post("/{workspace_id}/invite", response_model=WorkspaceResponse)
@limiter.limit("20/minute")
async def invite_user(
    request:      Request,
    workspace_id: int,
    data:         InviteRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    ws = await _load_ws(workspace_id, db)
    if ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can invite members.")

    ur = await db.execute(select(User).where(User.email == data.email.lower()))
    target = ur.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="No account found with that email address.")

    ex = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id      == target.id,
        )
    )
    if ex.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member.")

    db.add(WorkspaceMember(workspace_id=workspace_id, user_id=target.id, role=MemberRole(data.role)))
    await db.flush()
    return _ws_resp(await _load_ws(workspace_id, db))


@router.post("/join/{invite_token}", response_model=WorkspaceResponse)
@limiter.limit("20/minute")
async def join_by_invite(
    request:      Request,
    invite_token: str,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    r = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.members).selectinload(WorkspaceMember.user))
        .where(Workspace.invite_token == invite_token)
    )
    ws = r.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link.")

    ex = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == ws.id,
            WorkspaceMember.user_id      == current_user.id,
        )
    )
    if not ex.scalar_one_or_none():
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role=MemberRole.editor))
        await db.flush()

    return _ws_resp(await _load_ws(ws.id, db))


@router.delete("/{workspace_id}/members/{user_id}", status_code=204)
@limiter.limit("20/minute")
async def remove_member(
    request:      Request,
    workspace_id: int,
    user_id:      int,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = r.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    # Only owner can remove others; anyone can remove themselves
    if ws.owner_id != current_user.id and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not authorised")
    # Cannot remove the owner
    if user_id == ws.owner_id:
        raise HTTPException(status_code=400, detail="Cannot remove the workspace owner.")

    mr = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id      == user_id,
        )
    )
    m = mr.scalar_one_or_none()
    if m:
        await db.delete(m)


@router.delete("/{workspace_id}", status_code=204)
@limiter.limit("20/minute")
async def delete_workspace(
    request:      Request,
    workspace_id: int,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Permanently delete a workspace. Only the owner can do this."""
    r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = r.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    if ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the workspace owner can delete it.")
    await db.delete(ws)
