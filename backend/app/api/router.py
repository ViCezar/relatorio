from fastapi import APIRouter

from app.api.endpoints import agents, auth, branches, reports, sectors, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix='/auth', tags=['auth'])
api_router.include_router(branches.router, prefix='/branches', tags=['branches'])
api_router.include_router(sectors.router, prefix='/sectors', tags=['sectors'])
api_router.include_router(agents.router, prefix='/agents', tags=['agents'])
api_router.include_router(reports.router, prefix='/reports', tags=['reports'])
api_router.include_router(users.router, prefix='/users', tags=['users'])
