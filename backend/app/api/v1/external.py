from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.api.deps import DbSession, get_api_key_client, record_api_usage
from app.models import ApiKey

router = APIRouter(prefix="/external/v1", tags=["external"])


@router.get("/status")
async def partner_status(
    request: Request,
    db: DbSession,
    api_key: Annotated[ApiKey, Depends(get_api_key_client)],
) -> dict[str, object]:
    """Reference endpoint for the API-key auth path used by licensed integrations.

    Every call is logged via record_api_usage — that ledger is what later powers
    rate limiting and royalty/usage-based billing for the partner.
    """
    await record_api_usage(db, api_key=api_key, endpoint=request.url.path, status_code=200)
    return {"client": api_key.client_name, "scopes": api_key.scopes}
