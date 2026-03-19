from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Agent(Base):
    __tablename__ = 'agents'
    __table_args__ = (UniqueConstraint('branch_id', 'name', name='uq_agent_branch_name'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey('branches.id', ondelete='CASCADE'), nullable=False, index=True)
    sector_id: Mapped[int] = mapped_column(ForeignKey('sectors.id', ondelete='RESTRICT'), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    branch = relationship('Branch', back_populates='agents')
    sector = relationship('Sector', back_populates='agents')
    report_items = relationship('MonthlyReportItem', back_populates='agent')
