from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MonthlyReport(Base):
    __tablename__ = 'monthly_reports'
    __table_args__ = (UniqueConstraint('branch_id', 'month', 'year', name='uq_report_branch_month_year'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey('branches.id', ondelete='CASCADE'), nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)

    branch = relationship('Branch', back_populates='reports')
    items = relationship('MonthlyReportItem', back_populates='report', cascade='all, delete-orphan')
    pending_items = relationship('PendingImportItem', back_populates='report', cascade='all, delete-orphan')


class MonthlyReportItem(Base):
    __tablename__ = 'monthly_report_items'
    __table_args__ = (UniqueConstraint('report_id', 'agent_id', name='uq_report_item_agent'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(ForeignKey('monthly_reports.id', ondelete='CASCADE'), nullable=False, index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey('agents.id', ondelete='RESTRICT'), nullable=False, index=True)
    baldussi_destino: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    baldussi_origem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blip: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tickets_finalizados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    raw_name_from_excel: Mapped[str | None] = mapped_column(String(255), nullable=True)

    report = relationship('MonthlyReport', back_populates='items')
    agent = relationship('Agent', back_populates='report_items')


class PendingImportItem(Base):
    __tablename__ = 'pending_import_items'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(ForeignKey('monthly_reports.id', ondelete='CASCADE'), nullable=False, index=True)
    raw_name_from_excel: Mapped[str] = mapped_column(String(255), nullable=False)
    tickets_finalizados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    resolved: Mapped[bool] = mapped_column(default=False, nullable=False)
    resolved_agent_id: Mapped[int | None] = mapped_column(ForeignKey('agents.id', ondelete='SET NULL'), nullable=True)

    report = relationship('MonthlyReport', back_populates='pending_items')
    resolved_agent = relationship('Agent')
