"""
Collaboration WebSocket  — /api/v1/ws/{file_id}
Features:
  - JWT auth + membership check before accept()
  - Role-based edit control: 'viewer' role → read-only, edits rejected
  - asyncio.Lock (mutex) per room — only one edit committed at a time
  - Edit content size capped
  - Chat messages sanitised
  - Cursor position validated
"""
import json
import asyncio
from typing import Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from core.database import AsyncSessionLocal
from core.auth import get_current_user_ws
from core.config import get_settings
from core.security import sanitise_chat_message, validate_content_size
from models.file import File, FileVersion
from models.workspace import WorkspaceMember
from models.chat import ChatMessage

router   = APIRouter(tags=["websocket"])
settings = get_settings()

USER_COLORS = ["#38e2ff","#a259ff","#2cf59e","#ff8c42","#ffd166","#ff4d6d","#06b6d4","#8b5cf6"]

def _color(uid: int) -> str:
    return USER_COLORS[uid % len(USER_COLORS)]


class Room:
    def __init__(self):
        self.connections: Dict[int, WebSocket] = {}
        self.user_info:   Dict[int, dict]      = {}
        self.cursors:     Dict[int, dict]      = {}
        # Mutex: only one edit can be written to DB at a time per room
        self.edit_lock: asyncio.Lock = asyncio.Lock()

    def add(self, uid: int, ws: WebSocket, info: dict):
        self.connections[uid] = ws
        self.user_info[uid]   = info
        self.cursors[uid]     = {"line": 1, "col": 1}

    def remove(self, uid: int):
        self.connections.pop(uid, None)
        self.user_info.pop(uid, None)
        self.cursors.pop(uid, None)

    def is_empty(self) -> bool:
        return not self.connections

    def get_role(self, uid: int) -> str:
        return self.user_info.get(uid, {}).get("role", "viewer")

    def can_edit(self, uid: int) -> bool:
        return self.get_role(uid) in ("editor", "owner")

    async def broadcast(self, msg: dict, exclude: int = None):
        dead = []
        for uid, ws in list(self.connections.items()):
            if uid == exclude:
                continue
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.remove(uid)

    async def send_to(self, uid: int, msg: dict):
        ws = self.connections.get(uid)
        if ws:
            try:
                await ws.send_json(msg)
            except Exception:
                self.remove(uid)

    def presence_list(self) -> list:
        return [
            {
                "user_id":  uid,
                "name":     self.user_info[uid]["name"],
                "initials": self.user_info[uid]["initials"],
                "color":    self.user_info[uid]["color"],
                "role":     self.user_info[uid]["role"],
                "cursor":   self.cursors.get(uid, {"line": 1, "col": 1}),
            }
            for uid in self.connections
        ]


_rooms: Dict[int, Room] = {}


@router.websocket("/ws/{file_id}")
async def collab_ws(
    websocket: WebSocket,
    file_id:   int,
    token:     str = Query(...),
):
    # ── Auth + membership check (before accept) ────────────────────
    async with AsyncSessionLocal() as db:
        user = await get_current_user_ws(token, db)
        if not user:
            await websocket.close(code=4001, reason="Unauthorized")
            return

        # Verify file exists and user is workspace member
        f_r = await db.execute(select(File).where(File.id == file_id))
        f   = f_r.scalar_one_or_none()
        if not f:
            await websocket.close(code=4004, reason="File not found")
            return

        m_r = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == f.workspace_id,
                WorkspaceMember.user_id      == user.id,
            )
        )
        member = m_r.scalar_one_or_none()
        if not member:
            await websocket.close(code=4003, reason="Not a member")
            return

        role         = member.role  # "owner" | "editor" | "viewer"
        initial_content = f.content or ""

    await websocket.accept()

    # ── Join / create room ─────────────────────────────────────────
    if file_id not in _rooms:
        _rooms[file_id] = Room()
    room = _rooms[file_id]

    initials  = "".join(p[0].upper() for p in user.name.split()[:2])
    user_info = {
        "name":     user.name,
        "initials": initials,
        "color":    _color(user.id),
        "role":     role,
    }
    room.add(user.id, websocket, user_info)

    # Send initial state to new joiner
    await websocket.send_json({
        "type":     "init",
        "content":  initial_content,
        "presence": room.presence_list(),
        "role":     role,
        "can_edit": room.can_edit(user.id),
    })

    # Notify others
    await room.broadcast({
        "type":     "user_joined",
        "user_id":  user.id,
        "presence": room.presence_list(),
    }, exclude=user.id)

    # ── Message loop ───────────────────────────────────────────────
    try:
        while True:
            raw = await websocket.receive_text()

            if len(raw) > 4_194_304:
                continue

            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                continue

            msg_type = data.get("type")

            # ── Edit ── (mutex-protected, role-checked) ────────────
            if msg_type == "edit":
                # Role check — viewers cannot edit
                if not room.can_edit(user.id):
                    await websocket.send_json({
                        "type":    "error",
                        "message": "You have read-only access to this file.",
                        "code":    "READ_ONLY",
                    })
                    continue

                new_content = data.get("content", "")
                try:
                    new_content = validate_content_size(new_content, settings.MAX_FILE_CONTENT_BYTES)
                except ValueError:
                    await websocket.send_json({
                        "type":    "error",
                        "message": "File content exceeds maximum allowed size.",
                    })
                    continue

                # Mutex lock — serialise DB writes per room
                async with room.edit_lock:
                    async with AsyncSessionLocal() as db:
                        f_r = await db.execute(select(File).where(File.id == file_id))
                        f   = f_r.scalar_one_or_none()
                        if f:
                            f.content    = new_content
                            f.edit_count += 1
                            if f.edit_count % 50 == 0:
                                db.add(FileVersion(
                                    file_id=f.id, content=new_content,
                                    label=f"Auto-snapshot (edit {f.edit_count})",
                                    created_by=user.id,
                                ))
                            await db.commit()

                await room.broadcast({
                    "type":      "edit",
                    "content":   new_content,
                    "user_id":   user.id,
                    "user_name": user_info["name"],
                }, exclude=user.id)

            # ── Cursor ────────────────────────────────────────────
            elif msg_type == "cursor":
                raw_pos = data.get("position", {})
                try:
                    pos = {
                        "line": max(1, int(raw_pos.get("line", 1))),
                        "col":  max(1, int(raw_pos.get("col",  1))),
                    }
                except (TypeError, ValueError):
                    continue
                room.cursors[user.id] = pos
                await room.broadcast({
                    "type":      "cursor",
                    "user_id":   user.id,
                    "position":  pos,
                    "user_info": user_info,
                }, exclude=user.id)

            # ── Chat ──────────────────────────────────────────────
            elif msg_type == "chat":
                raw_msg = data.get("message", "")
                clean   = sanitise_chat_message(raw_msg)
                if not clean:
                    continue

                async with AsyncSessionLocal() as db:
                    f_r = await db.execute(select(File).where(File.id == file_id))
                    f   = f_r.scalar_one_or_none()
                    if not f:
                        continue
                    msg_obj = ChatMessage(
                        workspace_id=f.workspace_id,
                        user_id=user.id,
                        message=clean,
                    )
                    db.add(msg_obj)
                    await db.commit()
                    await db.refresh(msg_obj)
                    msg_id   = msg_obj.id
                    msg_time = msg_obj.created_at.isoformat()

                payload = {
                    "type":          "chat",
                    "id":            msg_id,
                    "user_id":       user.id,
                    "user_name":     user_info["name"],
                    "user_initials": user_info["initials"],
                    "user_color":    user_info["color"],
                    "message":       clean,
                    "created_at":    msg_time,
                }
                await room.broadcast(payload, exclude=user.id)
                await room.send_to(user.id, {**payload, "is_me": True})

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[collab] WS error user={user.id}: {type(e).__name__}: {e}")
    finally:
        room.remove(user.id)
        if room.is_empty():
            _rooms.pop(file_id, None)
        else:
            await room.broadcast({
                "type":     "user_left",
                "user_id":  user.id,
                "presence": room.presence_list(),
            })
