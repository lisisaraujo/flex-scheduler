import os

# Required settings must exist before `app.main` (and its transitive imports) load.
# Tests that hit authenticated routes should override these with real test credentials;
# unauthenticated routes (like /healthz) never touch Firebase or the database.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/flexscheduler_test")
os.environ.setdefault("FIREBASE_PROJECT_ID", "test-project")

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
