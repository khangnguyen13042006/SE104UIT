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
- `app/routers/notifications.py` — one `GET /api/notifications` that returns the admin bell items already grouped into `dat_san` / `dich_vu` (low stock + "chưa phân ca cho ngày mai" after `SHIFT_REMINDER_HOUR`) / `danh_gia` (managers only) / `khac` (ops + HR + security alerts: soon-to-play, missing shifts, absent staff on shifts, unpaid last-month salary, new users, lockouts/rate-limit/chatbot-blocked events; most managers only).
- `app/core/protect.py` — ASGI middleware (registered before CORS) for security headers + per-IP rate limits (`RATE_RULES`), login lockout after 5 failures (`assert_login_allowed`/`record_login_fail`), OTP send/verify limits; events go to `security_events` and surface in the bell's `khac` group. Counters are in-memory (single worker). Set `SECRET_KEY` in env for production. Run `python test_security.py`. Add new bell items here, not by making the frontend call more endpoints.
- `app/routers/reports.py` — `GET /api/reports/today` powers the dashboard: today's revenue/bookings/occupancy plus the per-field schedule board (only fields that have bookings, each slot carrying its services and a derived `tinh_trang`: huy / sap_toi / dang_da / xong). Staff (NHAN_VIEN) may read it; the other report endpoints stay manager-only.
- `app/routers/chat.py` + `app/chatbot/` — role-aware Gemini function-calling chatbot (`POST /api/chat` for every role, `/confirm`, `/capabilities`). `chatbot/base.py` holds the tool registry (each `Tool.roles` gates it by GUEST/KHACH_HANG/NHAN_VIEN/QUAN_LY/ADMIN), `read_tools.py` run immediately, `write_tools.py` only build a signed `Proposal` (HMAC token, 10 min TTL, single use) that the user must confirm in the widget; `/confirm` re-checks role and then calls the same router functions the normal API uses. `guard.py` blocks injection/secret/SQL/PII prompts, rate-limits, and scrubs output; blocked/proposed/executed events go to `chat_audit_logs`. To add a chatbot ability, register a tool in `read_tools.py`/`write_tools.py` — never let the LLM write to the DB directly. Run `python test_chatbot.py` (offline, temp DB; `--live` also hits Gemini).

### Key business rules (encoded in config.py / helpers.py — keep these in sync with any pricing/policy change)

- Peak hours 17:00–22:00 have a separate rate (`gia_cao_diem` vs `gia_tieu_chuan`); a booking spanning the boundary is split and priced per-segment.
- Bookings: 30-minute increments, 0.5h–3h duration.
- Cancellation is fully automatic (nobody sets the rate by hand): ≥24h before start refunds 50%, <24h refunds nothing, and a manager-flagged venue fault (`loi_tu_san`) refunds 100% at any time. The refund is computed on what the customer has actually paid (`helpers.amount_paid`), so an unpaid booking has nothing to refund. Refund is tracked as an `invoices.trang_thai` state machine: `CHUA_THANH_TOAN` → `DA_THANH_TOAN` → `CHO_HOAN_TIEN` → `HOAN_TIEN`. Use `bookings._refund_rate`/`_refund_amount` everywhere the rate/amount is shown (legacy cancelled rows have a NULL rate that means 50%).
- Payment window: an online booking must be paid within `PAYMENT_WINDOW_MINUTES` (30, `bookings.han_thanh_toan`); the scheduler (`scheduler.cancel_expired_unpaid`) auto-cancels overdue `CHO_XAC_NHAN` bookings. The payment page/my-bookings show a countdown.
- Payment state = booking state: `CHO_XAC_NHAN` is the only unpaid/underpaid state; `DA_XAC_NHAN` and later mean fully paid (`helpers.amount_paid`/`payment_due`). A customer who taps "I have transferred" without a receipt sets `bookings.khach_bao_chuyen_khoan` (staff are notified by email + admin bell, the scheduler will not auto-cancel it); a receipt that passes the AI check (`verify-receipt`) or staff `/confirm` moves it to `DA_XAC_NHAN`.
- Rescheduling recomputes the invoice. If the new total exceeds what was already paid, the booking goes back to `CHO_XAC_NHAN` (paid part kept in `invoices.so_tien_da_tt`, payment page shows the difference, email is sent) and returns to `DA_XAC_NHAN` once paid. If the new total is lower or equal, it stays confirmed and the overpayment is not refunded. `POST /api/bookings/{id}/reschedule-preview` returns the bill without changing anything.
- Membership tier is auto-computed from lifetime completed-booking spend (not purchased): Bạc >1tr (5%), Vàng >3tr (10%), Kim Cương >7tr (15%); discount applies to field price only, not services.
- Services flagged `la_cho_thue=true` (rentals) restock inventory when a booking completes; others decrement permanently.
- Login/register email must be `@gmail.com`, except staff accounts which use `@sanbong.vn`.

### Frontend structure

- `src/lib/useApi.ts` — stale-while-revalidate cache over GETs (memory + sessionStorage, request dedup). Admin pages call `primeFromCache([...keys], apply)` at the top of `load()` and fetch with `cachedGet` so navigation shows the previous data instantly instead of a spinner; the sidebar `prefetch`es a page's data on hover and `clearApiCache()` runs on logout. Use `useApi(key, refreshMs)` for self-refreshing panels (dashboard, notification bell). Heavy three.js views are `next/dynamic` with `ssr: false` to keep route bundles small.
- `src/lib/api.ts` — the only HTTP client; all requests go through `api()`/`apiGet`/`apiPost`/`apiPut`/`apiDelete`/`apiUpload`. It attaches the JWT from `localStorage` automatically and normalizes FastAPI error bodies (`detail`) into thrown `Error`s with `.status`/`.detail`. Auth state (`token`, `user`) lives in `localStorage`, accessed via `getToken`/`setToken`/`getUser`/`setUser`/`clearToken` — there is no global auth context/provider, so pages read this directly.
- `src/app/` — App Router pages, one directory per route matching the 9 business modules (booking, my-bookings, membership, feedback, admin/*). `src/app/admin/` is the whole staff/admin console (dashboard, bookings, fields, services, users, shifts, feedbacks, reports) gated by role, not by route middleware — check `getUser().vai_tro` client-side.
- Role values used client-side match the backend enum exactly: `ADMIN`, `QUAN_LY`, `NHAN_VIEN`, `KHACH_HANG`.
- `formatVND`/`formatDate`/`formatDateTime` in `api.ts` are the standard formatters for currency/dates — use them instead of ad hoc formatting to stay consistent with `vi-VN` locale output.

### Cross-cutting

- CORS origins are configured in `app/main.py` (`DEFAULT_ORIGINS` + `ALLOWED_ORIGINS` env var + a regex allowing `se104uit-*.vercel.app` previews) — update this, not the frontend, when adding a new deployment origin.
- `backend/.env` holds secrets (`GEMINI_API_KEY`, `DATABASE_URL`); never commit real values there or echo them into code/output.
