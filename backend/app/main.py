from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

api = APIRouter(prefix="/api/v1")
for module in (auth, demo, organizations, staff, members, plans, subscriptions, payments,
               attendance, reports, audit_logs, platform):
    api.include_router(module.router)
app.include_router(api)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
