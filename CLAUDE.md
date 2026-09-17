# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Football field booking & management system (Đồ án SE104, UIT). Monorepo with two independently-run apps:

- `backend/` — FastAPI 0.115 + SQLAlchemy 2.0 + JWT, SQLite by default (MySQL / Azure SQL supported via `DATABASE_URL`)
- `frontend/` — Next.js 14 (App Router) + TypeScript + TailwindCSS v4

There is no test suite in this repo — verify changes by running the apps and exercising the flow manually (see "Common commands" and README's "Kiểm thử nhanh" section).

## Common commands

### Backend (from `backend/`)

```bash
pip install -r requirements.txt
python seed.py                                          # creates san_bong.db + demo data (see README for demo accounts)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 # dev server, http://localhost:8000/docs for Swagger
```

Reset local DB when data looks corrupted or stale: delete `san_bong.db` and re-run `seed.py`.

To switch database backend, set `DATABASE_URL` in `backend/.env` (see `backend/app/core/database.py` for the three supported schemes: `sqlite:///`, `mysql+pymysql://`, `mssql+pyodbc://`). For MySQL, `schema.sql` can init schema manually; for Azure SQL use `init_db.py` instead (syntax differs). `test_azure_connection.py` sanity-checks an Azure SQL connection string.

### Frontend (from `frontend/`)

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

Set `NEXT_PUBLIC_API_URL` in `.env.local` if the backend isn't on `http://localhost:8000`.

## Architecture

### Backend structure

- `app/core/config.py` — all enums (roles, statuses, booking/payment states) and business-rule constants (membership thresholds/discounts/fees). This is the single source of truth for valid state values — check here before adding new statuses.
- `app/core/database.py` — engine/session setup; branches behavior by `DATABASE_URL` scheme (SQLite/MySQL/MSSQL need different `connect_args`/pool settings).
- `app/core/security.py` — password hashing (bcrypt, 72-byte truncation), JWT issuance/decoding, and `require_roles(*roles)` dependency factory for role-gated endpoints. `get_current_user_optional` supports endpoints usable by both guests and logged-in users (e.g. guest booking).
- `app/models/__init__.py` — all SQLAlchemy models in one file. Column names are Vietnamese (`ho_ten`, `ngay_dat`, `trang_thai`, etc.) — match this convention for new columns.
- `app/schemas/__init__.py` — all Pydantic schemas in one file, mirroring the models file.
- `app/routers/` — one router per resource (auth, users, fields, bookings, services, invoices, memberships, shifts, feedbacks, reports, chat), each mounted in `app/main.py`. `bookings.py` is by far the largest (~1000 lines) since it owns booking CRUD, conflict checking, pricing, cancellation/refund, and reminder-related endpoints.
- `app/utils/helpers.py` — core business calculations: peak-hour pricing split (`calculate_field_price`), booking time-slot validation (`is_valid_booking_time`), conflict detection (`has_booking_conflict`), membership tier/discount derivation from lifetime spend (`calculate_tier_from_spend`, `get_discount_rate`). Reuse these rather than reimplementing pricing/validation logic in routers.
- `app/utils/scheduler.py` — background asyncio task (`reminder_loop`, started in `main.py` lifespan) that polls bookings every 60s and emails a reminder ~30 min before `gio_bat_dau`, gated by the `reminder_sent` flag so it only fires once.
- `app/routers/chat.py` — Gemini-backed chatbot that can propose a `booking_action`; `validate_and_sanitize_booking_action` re-validates/sanitizes anything the model outputs against real DB state before it's trusted (never trust the LLM's booking action directly).

### Key business rules (encoded in config.py / helpers.py — keep these in sync with any pricing/policy change)

- Peak hours 17:00–22:00 have a separate rate (`gia_cao_diem` vs `gia_tieu_chuan`); a booking spanning the boundary is split and priced per-segment.
- Bookings: 30-minute increments, 0.5h–3h duration.
- Cancellation: >24h before start refunds 50% of field cost; <24h refunds nothing (refund is tracked as an `invoices.trang_thai` state machine: `CHUA_THANH_TOAN` → `DA_THANH_TOAN` → `CHO_HOAN_TIEN` → `HOAN_TIEN`).
- Membership tier is auto-computed from lifetime completed-booking spend (not purchased): Bạc >1tr (5%), Vàng >3tr (10%), Kim Cương >7tr (15%); discount applies to field price only, not services.
- Services flagged `la_cho_thue=true` (rentals) restock inventory when a booking completes; others decrement permanently.
- Login/register email must be `@gmail.com`, except staff accounts which use `@sanbong.vn`.

### Frontend structure

- `src/lib/api.ts` — the only HTTP client; all requests go through `api()`/`apiGet`/`apiPost`/`apiPut`/`apiDelete`/`apiUpload`. It attaches the JWT from `localStorage` automatically and normalizes FastAPI error bodies (`detail`) into thrown `Error`s with `.status`/`.detail`. Auth state (`token`, `user`) lives in `localStorage`, accessed via `getToken`/`setToken`/`getUser`/`setUser`/`clearToken` — there is no global auth context/provider, so pages read this directly.
- `src/app/` — App Router pages, one directory per route matching the 9 business modules (booking, my-bookings, membership, feedback, admin/*). `src/app/admin/` is the whole staff/admin console (dashboard, bookings, fields, services, users, shifts, feedbacks, reports) gated by role, not by route middleware — check `getUser().vai_tro` client-side.
- Role values used client-side match the backend enum exactly: `ADMIN`, `QUAN_LY`, `NHAN_VIEN`, `KHACH_HANG`.
- `formatVND`/`formatDate`/`formatDateTime` in `api.ts` are the standard formatters for currency/dates — use them instead of ad hoc formatting to stay consistent with `vi-VN` locale output.

### Cross-cutting

- CORS origins are configured in `app/main.py` (`DEFAULT_ORIGINS` + `ALLOWED_ORIGINS` env var + a regex allowing `se104uit-*.vercel.app` previews) — update this, not the frontend, when adding a new deployment origin.
- `backend/.env` holds secrets (`GEMINI_API_KEY`, `DATABASE_URL`); never commit real values there or echo them into code/output.
