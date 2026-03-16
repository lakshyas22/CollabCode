from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    owned_workspaces: Mapped[list["Workspace"]] = relationship("Workspace", back_populates="owner", foreign_keys="Workspace.owner_id")
    memberships: Mapped[list["WorkspaceMember"]] = relationship("WorkspaceMember", back_populates="user")
    messages: Mapped[list["ChatMessage"]] = relationship("ChatMessage", back_populates="user")
    file_versions: Mapped[list["FileVersion"]] = relationship("FileVersion", back_populates="created_by_user")
