"""Super-admin endpoints — protected by X-Super-Admin-Secret header only (no Firebase token).

Only the developer/product owner has this secret. Use it to bootstrap orgs and teams,
which cannot be created through the normal UI. Every billable team goes through here.
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import DbSession, require_super_admin
from app.repositories.auth_repository import (
    assign_org_admin,
    create_organization,
    create_team,
    list_organizations,
)

router = APIRouter(prefix="/api/v1/super-admin", tags=["super-admin"])

SuperAdminDep = Annotated[None, Depends(require_super_admin())]


class CreateOrgBody(BaseModel):
    name: str
    adminUserId: str | None = None  # optional: immediately make this user org_admin


class CreateTeamBody(BaseModel):
    name: str


class AssignOrgAdminBody(BaseModel):
    userId: str


@router.get("/organizations")
async def list_orgs(_: SuperAdminDep, db: DbSession):
    orgs = await list_organizations(db)
    return {"ok": True, "organizations": orgs}


@router.post("/organizations")
async def create_org(body: CreateOrgBody, _: SuperAdminDep, db: DbSession):
    if len(body.name.strip()) < 2:
        raise HTTPException(400, "Organization name must be at least 2 characters")

    admin_uuid = None
    if body.adminUserId:
        try:
            admin_uuid = uuid.UUID(body.adminUserId)
        except ValueError:
            raise HTTPException(400, "Invalid adminUserId")

    try:
        org = await create_organization(db, name=body.name, admin_user_id=admin_uuid)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    return {
        "ok": True,
        "org": {"orgId": str(org.id), "orgName": org.name},
    }


@router.post("/organizations/{org_id}/teams")
async def create_team_in_org(org_id: str, body: CreateTeamBody, _: SuperAdminDep, db: DbSession):
    if len(body.name.strip()) < 2:
        raise HTTPException(400, "Team name must be at least 2 characters")

    try:
        team = await create_team(db, org_id=uuid.UUID(org_id), name=body.name)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    return {
        "ok": True,
        "team": {"teamId": str(team.id), "teamName": team.name, "orgId": str(team.org_id)},
    }


@router.post("/organizations/{org_id}/admins")
async def add_org_admin(org_id: str, body: AssignOrgAdminBody, _: SuperAdminDep, db: DbSession):
    try:
        await assign_org_admin(db, org_id=uuid.UUID(org_id), user_id=uuid.UUID(body.userId))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"ok": True}
