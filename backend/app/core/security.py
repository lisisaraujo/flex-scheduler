import hashlib
import json
from functools import lru_cache

import firebase_admin
import httpx
from fastapi import HTTPException, status
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from app.core.config import get_settings


@lru_cache
def _firebase_app() -> firebase_admin.App:
    settings = get_settings()

    if settings.firebase_credentials_json:
        cred = credentials.Certificate(json.loads(settings.firebase_credentials_json))
    elif settings.firebase_credentials_file:
        cred = credentials.Certificate(settings.firebase_credentials_file)
    else:
        cred = credentials.ApplicationDefault()

    return firebase_admin.initialize_app(cred, {"projectId": settings.firebase_project_id})


def verify_firebase_id_token(token: str) -> dict:
    try:
        return firebase_auth.verify_id_token(token, app=_firebase_app(), check_revoked=True)
    except (firebase_auth.InvalidIdTokenError, firebase_auth.ExpiredIdTokenError, firebase_auth.RevokedIdTokenError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")


def create_firebase_user(email: str, password: str, display_name: str) -> str:
    """Creates a Firebase Auth user and returns the generated firebase_uid."""
    try:
        user = firebase_auth.create_user(
            email=email,
            password=password,
            display_name=display_name,
            app=_firebase_app(),
        )
        return user.uid
    except firebase_auth.EmailAlreadyExistsError:
        raise ValueError("An account with this email already exists")
    except Exception as exc:
        raise ValueError(f"Failed to create Firebase user: {exc}") from exc


async def sign_in_with_firebase_password(email: str, password: str) -> tuple[str, str, str]:
    """Signs in via the Firebase Identity Toolkit REST API.

    Returns (firebase_uid, id_token, refresh_token). Raises HTTPException(401) on bad credentials.
    """
    settings = get_settings()
    if not settings.firebase_web_api_key:
        raise HTTPException(status_code=500, detail="FIREBASE_WEB_API_KEY not configured")

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={settings.firebase_web_api_key}"
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json={"email": email, "password": password, "returnSecureToken": True})

    payload = resp.json() if resp.content else {}
    if not resp.is_success or not payload.get("idToken"):
        code = payload.get("error", {}).get("message", "")
        if code in ("EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        if code == "USER_DISABLED":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This account is disabled")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    decoded = verify_firebase_id_token(payload["idToken"])
    return decoded["uid"], payload["idToken"], payload["refreshToken"]


def delete_firebase_user(firebase_uid: str) -> None:
    try:
        firebase_auth.delete_user(firebase_uid, app=_firebase_app())
    except Exception:
        pass  # best-effort cleanup


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
