from fastapi import APIRouter

from app.api.v1 import auth, external, health, invitations, members, months, me, super_admin

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(me.router)
api_router.include_router(external.router)
api_router.include_router(auth.router)
api_router.include_router(members.router)
api_router.include_router(invitations.router)
api_router.include_router(months.router)
api_router.include_router(super_admin.router)
