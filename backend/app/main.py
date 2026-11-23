import logging

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.modules import (
    attendance,
    audit_logs,
    auth,
    demo,
    members,
    organizations,
    payments,
    plans,
    platform,
    reports,
    staff,
    subscriptions,
)

app = FastAPI(
    title="Gymmy — Gym Management System API",
    version="0.1.0",
    description="Multi-tenant gym operations: members, memberships, payments and check-ins.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

log = logging.getLogger("gymmy")


@app.exception_handler(OperationalError)
async def database_unavailable(_: Request, exc: OperationalError):
    """Can't reach or log in to PostgreSQL: answer 503 with a readable message
    instead of a 500 and a long traceback."""
    log.error("Database unavailable: %s", exc.orig)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Can't connect to the database. "
            "Check that PostgreSQL is running and DATABASE_URL is correct."
        },
    )


api = APIRouter(prefix="/api/v1")
for module in (auth, demo, organizations, staff, members, plans, subscriptions, payments,
               attendance, reports, audit_logs, platform):
    api.include_router(module.router)
app.include_router(api)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
