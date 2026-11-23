# Decisions and defaults

Section 14 of the getting-started guide lists decisions to make before development.
The code ships with the recommended defaults below. Each one is easy to change; the
notes say where.

| Question | Default in the code | Where it lives |
|---|---|---|
| Single gym or many from day one? | **Multi-tenant from day one.** Every gym-owned row has `organization_id`; the tenant always comes from the signed-in user. | `app/core/deps.py` (`Tenant`), every module query |
| Member portal / app in the MVP? | **No.** Staff-facing web only. Members get a QR pass (printable from their profile). | `frontend/` |
| Payment methods at launch | Cash, UPI, card, bank transfer, recorded manually. No gateway yet. | `Method` in `app/modules/payments.py` |
| One branch or many? | Each gym gets a "Main branch". More can be added. A membership is valid at **all branches** unless sold for one branch. | `Subscription.branch_id` |
| Workout plans / group classes in pilot? | **Deferred** (milestone 6). | — |
| Country, currency, tax | Currency and timezone are per gym (default INR, Asia/Kolkata). **No tax/GST on receipts yet** — needs confirming before invoices go to customers. | `Organization` |
| Self-signup or manual onboarding? | **Self-signup** at `/signup`. Platform admins can suspend a gym. | `POST /auth/signup`, `/platform/*` |

## Business rules (section 6)

| Area | Rule implemented |
|---|---|
| Membership validity | Starts on a chosen start date (defaults to today in the gym's timezone). End date is inclusive: a 1-month plan from 15 Jan ends 14 Feb; 31 Jan + 1 month clamps to month end. |
| Renewal | Gym setting `renewal_mode`. `after_current` (default): new period starts the day after the current one ends, or today if it already ended. `immediate`: starts today. Staff can override the start date. A subscription can only be renewed once. |
| Freeze / hold | Receptionists and up can freeze an active membership. On unfreeze the end date moves out by the days frozen, capped by the plan's `max_freeze_days` across all freezes (0 = no cap). Every freeze is kept. |
| Expired access | Check-in is refused with a clear reason (expired, frozen, not started, suspended, no membership, wrong branch). Owners and managers can override with a reason; overrides are audited. |
| Partial payment | Each subscription tracks price (after discount), amount paid and balance due. Overpayment is rejected. |
| Refunds | A refund is a separate `payments` row (`kind=refund`) linked to the original, which is never changed. Total refunds can't exceed the original. |
| Duplicate members | Phone number triggers a warning (HTTP 409) that staff can confirm past. It is not a unique key. |
| Time and currency | Timestamps stored in UTC; "today", day boundaries and reports use the gym's timezone. |
| Duplicate requests | Check-ins within 30 minutes of the last one return the existing record. Payments accept an `Idempotency-Key` header; the UI sends one per form. |

## Roles

| Permission | Owner | Manager | Receptionist | Trainer |
|---|:-:|:-:|:-:|:-:|
| Gym settings, staff management | ✓ | | | |
| Plans, reports, refunds, cancellations, check-in override, audit log | ✓ | ✓ | | |
| Members, sell/renew/freeze, take payments, check-in, dashboard | ✓ | ✓ | ✓ | |
| View members, plans, attendance | ✓ | ✓ | ✓ | ✓ |

Defined in `backend/app/core/permissions.py`. Per-gym custom roles can be layered on later
without touching the endpoint checks.

## Known gaps / next steps

- Email delivery (staff invites, password reset links, expiry and dues reminders). Today the owner shares a temporary password.
- Background worker (Redis) for reminders and scheduled jobs.
- PostgreSQL row-level security as defence in depth on top of the app-level tenant filter.
- Tax/GST fields and printable receipts/invoices.
- Platform admin console in the UI (API exists).
- Tokens are kept in `localStorage`; move to httpOnly cookies before production.
- Rate limiting on `/auth/login`.
