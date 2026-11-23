# Gymmy — Gym Management System

Multi-tenant web app for running a gym's front desk: members, memberships, payments,
check-ins and the owner's view of the business. Built from the *Gym Management System —
Getting Started Guide* (MVP, milestones 1–4).

- **backend/** — FastAPI + SQLAlchemy + PostgreSQL, Alembic migrations, pytest suite
- **frontend/** — Next.js (App Router, TypeScript) staff web app built on [Untitled UI React](https://www.untitledui.com/react) components (React Aria + Tailwind CSS v4), with Motion animations
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

## The staff app

- **Untitled UI components** (MIT) live in `frontend/src/components/{base,application,foundations,shared-assets}`, copied from the open-source repo the way their CLI does it, so they can be edited. App-specific pieces are in `frontend/src/components/app`.
- **Motion:** spring page transitions, a sliding sidebar indicator, count-up stats, an animated check-in result (draws a tick or cross, shakes on refusal, auto-clears after success), staggered list entrances and modal/toast transitions. Everything respects the OS "reduce motion" setting.
- **Speed at the desk:** `Ctrl/⌘ K` opens a search for members and pages from anywhere; `/` focuses the check-in field; scanners can type a QR code straight in and press Enter.
- **Feedback:** toasts for every action, skeleton loaders, empty states with next steps, confirm dialogs instead of browser pop-ups, inline duplicate-phone warnings, unsaved-changes bar in settings.
- **Light, dark and system themes**, responsive down to phone width with a slide-in menu.

## View demo

The login and signup pages have a **View demo** button. Each click creates a private sandbox gym
("Pulse Fitness Studio") with realistic sample data — about 60 members covering every state
(active, expiring this week, expired, frozen, starting soon, suspended, partly paid, cancelled with a
refund), six plans, two branches, four staff and six weeks of payments and check-ins.

Inside the demo, a bar at the top lets you:

- **Switch role** between Owner, Manager, Front desk and Trainer to see what each one can do.
- Open **Things to try**: guided steps with real member numbers (check someone in, see a refused
  check-in, sell a plan, unfreeze a membership, chase dues, search).
- **Reset** to a fresh gym at any time.

Sandboxes are isolated from real gyms and from each other, and are deleted after 24 hours. Configure
with `DEMO_ENABLED`, `DEMO_TTL_HOURS` and `DEMO_MAX_ACTIVE` (see `backend/.env.example`); turn it off in
production if you don't want public sandboxes.

## Run it locally

### Without Docker (recommended for development)

Needs Python 3.12+, Node.js 20+ and PostgreSQL 14+ installed and running (Linux, macOS or WSL).

```bash
./scripts/setup.sh --seed
```

```bash
./scripts/dev.sh
```

Open http://localhost:3000 and click **View demo**, or sign in as `owner@demo.gym` / `demo-pass-1`.

`setup.sh` checks your tools; creates a `gymmy` database user and the `gymmy` + `gymmy_test`
databases (it never changes your `postgres` password); sets up `backend/.venv`, writes
`backend/.env` with a random secret and runs migrations; installs the frontend and writes
`frontend/.env.local`. It's safe to re-run. Options: `--seed` loads the demo gym, `--test` runs the
backend tests, `--skip-frontend`. Override defaults with `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`, `API_PORT`, `WEB_PORT`.

To create the database user, the script needs admin access to PostgreSQL once. It tries, in order:
your own OS user (Homebrew on macOS), `PG_ADMIN_USER`/`PG_ADMIN_PASSWORD` if you set them, then
`sudo -u postgres` (Ubuntu/Debian default). If none work it tells you what to set.

`dev.sh` runs the API on 127.0.0.1:8000 and the web app on :3000 with live reload; Ctrl+C stops both.

### With Docker

```bash
docker compose up --build
```

```bash
docker compose exec api python -m app.cli seed-demo
```

### How the frontend reaches the API (and CORS)

The web app calls `/api/v1/...` on its own origin and Next.js forwards it to the API
(`API_ORIGIN`, default `http://127.0.0.1:8000`), so the browser never makes a cross-origin
request. If you'd rather call the API directly, set `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`;
the API allows any `localhost` / `127.0.0.1` port in development and the origins in `CORS_ORIGINS`.
For production, set `CORS_ORIGINS` to your real frontend URL and `CORS_ORIGIN_REGEX=` (empty).

### Troubleshooting

- **`password authentication failed for user "postgres"`**: your `DATABASE_URL` has the wrong
  login. Run `./scripts/setup.sh`; it creates its own `gymmy` user and fixes `backend/.env`.
- **"Can't reach the Gymmy API" in the app**: the backend isn't running, or not on the port in
  `frontend/.env.local`. Start it with `./scripts/dev.sh`.
- **Port already in use**: `API_PORT=8001 WEB_PORT=3001 ./scripts/dev.sh`.

API docs: http://127.0.0.1:8000/docs

## Tests

Backend tests run against a real PostgreSQL database (`gymmy_test`), applying the Alembic
migrations first:

```bash
./scripts/setup.sh --test
```

or directly: `cd backend && DATABASE_URL=postgresql+psycopg://gymmy:gymmy@127.0.0.1:5432/gymmy_test .venv/bin/pytest`

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
