from datetime import datetime
from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class File(Base):
    __tablename__ = "files"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    language: Mapped[str] = mapped_column(String(50), default="python")
    content: Mapped[str] = mapped_column(Text, default="")
    edit_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="files")
    versions: Mapped[list["FileVersion"]] = relationship("FileVersion", back_populates="file", cascade="all, delete-orphan", order_by="FileVersion.created_at.desc()")


class FileVersion(Base):
    __tablename__ = "file_versions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    file_id: Mapped[int] = mapped_column(ForeignKey("files.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    file: Mapped["File"] = relationship("File", back_populates="versions")
    created_by_user: Mapped["User"] = relationship("User", back_populates="file_versions")
