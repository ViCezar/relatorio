from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Branch(Base):
    __tablename__ = 'branches'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    sectors = relationship('Sector', back_populates='branch', cascade='all, delete-orphan')
    agents = relationship('Agent', back_populates='branch', cascade='all, delete-orphan')
    reports = relationship('MonthlyReport', back_populates='branch', cascade='all, delete-orphan')
