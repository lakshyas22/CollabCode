"""
Chat router  — /api/v1/chat/...
Messages are sanitised before DB insertion to prevent stored XSS.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, field_validator
from core.database import get_db
from core.auth import get_current_user
from core.config import get_settings
from core.security import limiter, sanitise_chat_message
from models.user import User
from models.workspace import WorkspaceMember
from models.chat import ChatMessage

router   = APIRouter(prefix="/chat", tags=["chat"])
settings = get_settings()


class SendMessageRequest(BaseModel):
    workspace_id: int
    message:      str

    @field_validator("message")
    @classmethod
    def clean_message(cls, v: str) -> str:
        v = sanitise_chat_message(v)
        if not v:
            raise ValueError("Message must not be empty.")
        return v


class MessageResponse(BaseModel):
    id:             int
    workspace_id:   int
    user_id:        int
    user_name:      str
    user_initials:  str
    message:        str
    created_at:     str


def _msg_to_resp(m: ChatMessage) -> MessageResponse:
    initials = "".join(w[0].upper() for w in m.user.name.split()[:2])
    return MessageResponse(
        id=m.id, workspace_id=m.workspace_id, user_id=m.user_id,
        user_name=m.user.name, user_initials=initials,
        message=m.message, created_at=m.created_at.isoformat(),
    )


async def _check_member(workspace_id: int, user_id: int, db: AsyncSession):
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id      == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("", response_model=MessageResponse, status_code=201)
@limiter.limit(settings.RATE_LIMIT_CHAT)
async def send_message(
    request:      Request,
    data:         SendMessageRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    await _check_member(data.workspace_id, current_user.id, db)
    msg = ChatMessage(
        workspace_id=data.workspace_id,
        user_id=current_user.id,
        message=data.message,   # already sanitised by Pydantic validator
    )
    db.add(msg)
    await db.flush()

    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.id == msg.id)
    )
    return _msg_to_resp(result.scalar_one())


@router.get("/{workspace_id}", response_model=list[MessageResponse])
@limiter.limit(settings.RATE_LIMIT_API)
async def get_history(
    request:      Request,
    workspace_id: int,
    limit:        int            = 100,
    db:           AsyncSession   = Depends(get_db),
    current_user: User           = Depends(get_current_user),
):
    # Clamp limit to prevent fetching enormous histories
    limit = min(max(limit, 1), 200)
    await _check_member(workspace_id, current_user.id, db)
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.workspace_id == workspace_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    return [_msg_to_resp(m) for m in result.scalars().all()]
