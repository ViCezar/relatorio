from pydantic import BaseModel, ConfigDict


class SectorCreate(BaseModel):
    branch_id: int
    name: str
    color: str | None = None
    active: bool = True


class SectorUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    active: bool | None = None


class SectorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    branch_id: int
    name: str
    color: str | None
    active: bool
