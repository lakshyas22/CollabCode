"""
Files router  — /api/v1/file/...
Security:
  - File names validated for path traversal and dangerous chars
  - File content size capped (2 MB)
  - All queries use ORM parameterisation (no raw SQL)
  - Membership check before every operation
  - Per-workspace file cap enforced
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, field_validator
from typing import Optional
from core.database import get_db
from core.auth import get_current_user
from core.config import get_settings
from core.security import limiter, validate_filename, validate_content_size
from models.user import User
from models.workspace import WorkspaceMember
from models.file import File, FileVersion

router   = APIRouter(prefix="/file", tags=["files"])
settings = get_settings()
SNAPSHOT_EVERY = 50

# Allowed languages whitelist — prevents arbitrary language injection into terminal
ALLOWED_LANGUAGES = {
    "python","javascript","typescript","jsx","tsx","java","c","cpp","csharp",
    "go","rust","ruby","php","swift","kotlin","sql","bash","shell","html","xml",
    "css","scss","json","yaml","toml","markdown","dockerfile","graphql","lua",
    "r","perl","haskell","elixir","erlang","dart","text",
}


class CreateFileRequest(BaseModel):
    workspace_id: int
    name:         str
    language:     Optional[str] = "python"

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return validate_filename(v, max_len=settings.MAX_FILE_NAME_LENGTH)

    @field_validator("language")
    @classmethod
    def clean_lang(cls, v: str) -> str:
        v = (v or "text").lower().strip()
        return v if v in ALLOWED_LANGUAGES else "text"


class UpdateFileRequest(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def check_size(cls, v: str) -> str:
        return validate_content_size(v, max_bytes=settings.MAX_FILE_CONTENT_BYTES)


class RenameFileRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return validate_filename(v, max_len=settings.MAX_FILE_NAME_LENGTH)


class SaveVersionRequest(BaseModel):
    label: str

    @field_validator("label")
    @classmethod
    def clean_label(cls, v: str) -> str:
        from core.security import sanitise_name
        return sanitise_name(v, max_len=200) or "Manual snapshot"


class FileResponse(BaseModel):
    id:           int
    workspace_id: int
    name:         str
    language:     str
    content:      str
    edit_count:   int
    created_at:   str
    updated_at:   str


class VersionResponse(BaseModel):
    id:               int
    file_id:          int
    label:            str
    content:          str
    created_by_name:  Optional[str]
    created_at:       str
    line_count:       int


def _file_resp(f: File) -> FileResponse:
    return FileResponse(
        id=f.id, workspace_id=f.workspace_id, name=f.name,
        language=f.language, content=f.content, edit_count=f.edit_count,
        created_at=f.created_at.isoformat(), updated_at=f.updated_at.isoformat(),
    )


async def _check_member(workspace_id: int, user_id: int, db: AsyncSession):
    r = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id      == user_id,
        )
    )
    if not r.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("", response_model=FileResponse, status_code=201)
@limiter.limit(settings.RATE_LIMIT_API)
async def create_file(
    request:      Request,
    data:         CreateFileRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    await _check_member(data.workspace_id, current_user.id, db)

    # Enforce per-workspace file cap
    count_r = await db.execute(select(func.count()).where(File.workspace_id == data.workspace_id))
    if count_r.scalar_one() >= settings.MAX_FILES_PER_WORKSPACE:
        raise HTTPException(status_code=400, detail=f"Workspace file limit ({settings.MAX_FILES_PER_WORKSPACE}) reached.")

    f = File(workspace_id=data.workspace_id, name=data.name, language=data.language)
    db.add(f)
    await db.flush()
    await db.refresh(f)
    return _file_resp(f)


@router.get("/workspace/{workspace_id}", response_model=list[FileResponse])
@limiter.limit(settings.RATE_LIMIT_API)
async def list_files(
    request:      Request,
    workspace_id: int,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    await _check_member(workspace_id, current_user.id, db)
    r = await db.execute(select(File).where(File.workspace_id == workspace_id).order_by(File.name))
    return [_file_resp(f) for f in r.scalars().all()]


@router.get("/{file_id}", response_model=FileResponse)
@limiter.limit(settings.RATE_LIMIT_API)
async def get_file(
    request:      Request,
    file_id:      int,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    r = await db.execute(select(File).where(File.id == file_id))
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    await _check_member(f.workspace_id, current_user.id, db)
    return _file_resp(f)


@router.put("/{file_id}", response_model=FileResponse)
@limiter.limit(settings.RATE_LIMIT_API)
async def update_file(
    request:      Request,
    file_id:      int,
    data:         UpdateFileRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    r = await db.execute(select(File).where(File.id == file_id))
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    await _check_member(f.workspace_id, current_user.id, db)

    f.content    = data.content
    f.edit_count += 1

    if f.edit_count % SNAPSHOT_EVERY == 0:
        db.add(FileVersion(
            file_id=f.id, content=data.content,
            label=f"Auto-snapshot at edit {f.edit_count}",
            created_by=current_user.id,
        ))

    await db.flush()
    await db.refresh(f)
    return _file_resp(f)


@router.patch("/{file_id}/rename", response_model=FileResponse)
@limiter.limit(settings.RATE_LIMIT_API)
async def rename_file(
    request:      Request,
    file_id:      int,
    data:         RenameFileRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    r = await db.execute(select(File).where(File.id == file_id))
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    await _check_member(f.workspace_id, current_user.id, db)
    f.name = data.name
    await db.flush()
    await db.refresh(f)
    return _file_resp(f)


@router.delete("/{file_id}", status_code=204)
@limiter.limit(settings.RATE_LIMIT_API)
async def delete_file(
    request:      Request,
    file_id:      int,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    r = await db.execute(select(File).where(File.id == file_id))
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    await _check_member(f.workspace_id, current_user.id, db)
    await db.delete(f)


@router.get("/{file_id}/versions", response_model=list[VersionResponse])
@limiter.limit(settings.RATE_LIMIT_API)
async def get_versions(
    request:      Request,
    file_id:      int,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    r = await db.execute(select(File).where(File.id == file_id))
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    await _check_member(f.workspace_id, current_user.id, db)

    vr = await db.execute(
        select(FileVersion)
        .options(selectinload(FileVersion.created_by_user))
        .where(FileVersion.file_id == file_id)
        .order_by(FileVersion.created_at.desc())
        .limit(50)
    )
    return [
        VersionResponse(
            id=v.id, file_id=v.file_id, label=v.label, content=v.content,
            created_by_name=v.created_by_user.name if v.created_by_user else None,
            created_at=v.created_at.isoformat(),
            line_count=len(v.content.split("\n")),
        )
        for v in vr.scalars().all()
    ]


@router.post("/{file_id}/versions", response_model=VersionResponse, status_code=201)
@limiter.limit("20/minute")
async def save_version(
    request:      Request,
    file_id:      int,
    data:         SaveVersionRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    r = await db.execute(select(File).where(File.id == file_id))
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    await _check_member(f.workspace_id, current_user.id, db)

    v = FileVersion(file_id=f.id, content=f.content, label=data.label, created_by=current_user.id)
    db.add(v)
    await db.flush()
    await db.refresh(v)
    return VersionResponse(
        id=v.id, file_id=v.file_id, label=v.label, content=v.content,
        created_by_name=current_user.name,
        created_at=v.created_at.isoformat(),
        line_count=len(v.content.split("\n")),
    )


@router.post("/{file_id}/restore/{version_id}", response_model=FileResponse)
@limiter.limit("20/minute")
async def restore_version(
    request:    Request,
    file_id:    int,
    version_id: int,
    db:         AsyncSession = Depends(get_db),
    current_user: User       = Depends(get_current_user),
):
    fr = await db.execute(select(File).where(File.id == file_id))
    f  = fr.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    await _check_member(f.workspace_id, current_user.id, db)

    vr = await db.execute(
        select(FileVersion).where(FileVersion.id == version_id, FileVersion.file_id == file_id)
    )
    v = vr.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")

    db.add(FileVersion(file_id=f.id, content=f.content, label=f"Before restore to v{version_id}", created_by=current_user.id))
    f.content    = v.content
    f.edit_count += 1
    await db.flush()
    await db.refresh(f)
    return _file_resp(f)
