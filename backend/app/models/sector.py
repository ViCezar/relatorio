from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Sector(Base):
    __tablename__ = 'sectors'
    __table_args__ = (UniqueConstraint('branch_id', 'name', name='uq_sector_branch_name'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey('branches.id', ondelete='CASCADE'), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str | None] = mapped_column(String(30), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    branch = relationship('Branch', back_populates='sectors')
    agents = relationship('Agent', back_populates='sector')
