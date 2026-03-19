from pydantic import BaseModel, ConfigDict


class AgentCreate(BaseModel):
    branch_id: int
    sector_id: int
    name: str
    active: bool = True
    month: int | None = None
    year: int | None = None


class AgentUpdate(BaseModel):
    sector_id: int | None = None
    name: str | None = None
    active: bool | None = None


class AgentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    branch_id: int
    sector_id: int
    name: str
    active: bool
