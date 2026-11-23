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
log = logging.getLogger("gymmy")


@app.middleware("http")
async def catch_unhandled_errors(request: Request, call_next):
    """Turn unexpected exceptions into a JSON 500 *inside* the CORS middleware.

    Starlette's default 500 handler sits outside CORSMiddleware, so a crash reaches the
    browser without Access-Control-Allow-Origin and shows up as a misleading CORS error.
    """
    try:
        return await call_next(request)
    except Exception:
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Something went wrong on the server."})


# Added last so it is the outermost middleware: every response, errors included,
# gets CORS headers.
_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origin_list,
    allow_origin_regex=_settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Let the browser read the CSV filename on report downloads.
    expose_headers=["Content-Disposition"],
    max_age=600,
)


@app.exception_handler(OperationalError)
async def database_unavailable(_: Request, exc: OperationalError):
    """Can't reach or log in to PostgreSQL: answer 503 with a readable message
    instead of a 500 and a long traceback."""
    log.error("Database unavailable: %s", exc.orig)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Can't connect to the database. "
            "Check that the database is running and DATABASE_URL is correct."
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
