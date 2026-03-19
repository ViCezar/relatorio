from pydantic import BaseModel, ConfigDict


class BranchCreate(BaseModel):
    name: str
    active: bool = True


class BranchUpdate(BaseModel):
    name: str | None = None
    active: bool | None = None


class BranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    active: bool
