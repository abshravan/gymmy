# Gymmy — Gym Management System

Multi-tenant web app for running a gym's front desk: members, memberships, payments,
check-ins and the owner's view of the business. Built from the *Gym Management System —
Getting Started Guide* (MVP, milestones 1–4).

- **backend/** — FastAPI + SQLAlchemy + PostgreSQL, Alembic migrations, pytest suite
- **frontend/** — Next.js (App Router, TypeScript) staff web app
- **docs/decisions.md** — the business rules and defaults that were chosen, and what's next

## What works

| Area | |
|---|---|
| Gym onboarding | Self-service signup creates the gym, a main branch and the owner account |
| Staff & access | Add staff with roles (owner, manager, receptionist, trainer), disable, reset password; JWT access + rotating refresh tokens; Argon2 password hashing |
| Members | Register, search (name/phone/email/number), edit, suspend; duplicate-phone warning; QR pass |
| Plans | Day- or month-based plans with price and freeze allowance; archive |
| Memberships | Sell (with discount and optional payment in one step), renew, freeze/unfreeze, cancel; full history |
| Payments | Cash/UPI/card/bank transfer, partial payments and dues, receipts with per-gym numbering, refunds as separate records, idempotency keys |
| Check-in | QR, member number, phone or from search; clear refusal reasons; manager override with audit; duplicate protection |
| Dashboard & reports | Active members, today's check-ins and collections, dues, expiring soon; revenue, attendance, expiring and dues reports (CSV export) |
| Security | Tenant isolation on every query (tested), role-based permissions, audit log, platform admin can suspend gyms |

## Run it locally

With Docker:

```bash
docker compose up --build
```

Then open http://localhost:3000 and create a gym, or load demo data:

```bash
docker compose exec api python -m app.cli seed-demo
```

Demo logins: `owner@demo.gym` and `desk@demo.gym`, password `demo-pass-1`.

Without Docker (needs Python 3.12+, Node 22, PostgreSQL 16):

```bash
cd backend && python -m venv .venv && .venv/bin/pip install -e ".[dev]"
```

```bash
cd backend && DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/gymmy .venv/bin/alembic upgrade head
```

```bash
cd backend && DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/gymmy .venv/bin/uvicorn app.main:app --reload
```

```bash
cd frontend && npm install && npm run dev
```

API docs: http://localhost:8000/docs

## Tests

Backend tests run against a real PostgreSQL database (`gymmy_test`), applying the Alembic
migrations first:

```bash
cd backend && DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/gymmy_test .venv/bin/pytest
```

They cover the testing checklist in the guide: cross-gym access, duplicate warnings,
plan end dates, freeze/renew/cancel history, blocked check-ins, duplicate check-ins,
partial payments, refunds, staff permissions and report reconciliation.

## Platform admin

```bash
cd backend && .venv/bin/python -m app.cli create-platform-admin --email you@example.com
```

## Project layout

```
backend/app/
  core/        config, db, security, permissions, tenant dependency, audit
  models.py    all tables (every gym-owned row has organization_id)
  modules/     one router per area: auth, organizations, staff, members, plans,
               subscriptions, payments, attendance, reports, audit_logs, platform
frontend/src/
  app/(app)/   signed-in pages: dashboard, desk, members, plans, payments,
               attendance, reports, staff, settings
  lib/         API client (token refresh), auth context, types
```
