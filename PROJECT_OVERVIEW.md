# Mikael Dolfe App — Project overview (onboarding)

This document describes the **Mikael Dolfe** web application for onboarding: what it does, how it is structured, which services it uses, and common techniques. Use it together with `README.md`, `SETUP_GUIDE.md`, `PRODUCTION_SETUP.md`, and feature-specific guides (`STRIPE_SETUP.md`, `RESEND_SETUP.md`, etc.).

---

## 1. Purpose and scope

The project is a **single Node.js application** that serves:

- **Public author website** — home page, book detail pages, blog posts, contact, and book purchase flow.
- **Admin panel** — session-based CMS for blog posts, books, book blurbs (quotes), and order listing.
- **Integrations** — optional **Supabase** (hosted DB + file storage), **Stripe** (card payments in SEK), **Resend** (transactional email for the contact form).

The npm package name is `mikael-dolfe-admin`; the app is both the marketing site and the admin backend.

---

## 2. Technology stack

| Layer | Choice |
|--------|--------|
| Runtime | Node.js (CommonJS `require`) |
| HTTP | Express 4 |
| Templates | EJS (`src/views`), with shared partials under `src/views/components/` |
| Public UI | Server-rendered pages + static assets; **vanilla JavaScript** in `assets/scripts/script.js` (no React/Vue on the client) |
| Local database | SQLite 3 (`sqlite3` driver), file `database/mikael-dolfe.db` |
| Hosted database | Supabase (Postgres) via `@supabase/supabase-js`, when `DATABASE_TYPE=supabase` |
| Auth (admin) | `express-session` + bcrypt password verification against env |
| Payments | Stripe Payment Intents + webhook |
| Email | Resend SDK (`resend` package) for contact form |
| Security middleware | Helmet (CSP, HSTS), rate limiting, slow-down, XSS sanitization (`xss`) |
| Uploads | Multer (disk for SQLite, memory buffer → Supabase Storage for Supabase) |

Configuration is loaded with **dotenv** (`.env`). See `.env.example` for the main variables.

---

## 3. High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        server.js                             │
│  (Express app: middleware, routes, session, error handling)   │
└───────────────┬─────────────────────────────────────────────┘
                │
    ┌───────────┼───────────┬──────────────┬──────────────┐
    ▼           ▼           ▼              ▼              ▼
 DatabaseManager   StripeService   ResendService   Static / EJS
    │                 │                 │
    ├─ SQLite         │                 └─ Contact: admin + confirmation email
    └─ SupabaseService│
       (Postgres +     └─ Payment Intents, webhooks, SEK
        Storage)
```

- **Routes live in `server.js`** (not split into separate router modules). That keeps the project small but means the file is long; search by path (e.g. `/admin/`, `/api/`) when navigating.
- **Data access** is centralized in `DatabaseManager` (`src/services/database.js`), which switches implementation by `DATABASE_TYPE` (`sqlite` default, or `supabase`).
- **Stripe** and **Resend** are thin wrapper classes instantiated once at startup.

---

## 4. Repository layout

| Path | Role |
|------|------|
| `server.js` | Application entry: Express setup, all routes, multer, session |
| `package.json` | Scripts: `start`, `dev` (nodemon), `init-db` |
| `src/services/database.js` | Facade: SQLite vs Supabase for CRUD |
| `src/services/supabase.js` | Supabase client: tables + storage upload/URL |
| `src/services/stripe.js` | Payment Intents, customer handling, webhook verification |
| `src/services/resend.js` | Contact email + auto-reply |
| `src/views/` | EJS templates (public + `admin/` + `components/`) |
| `assets/` | CSS, JS, images, favicon (served under `/assets`) |
| `database/` | SQLite file (when using SQLite) |
| `uploads/` | Local book covers and profile images (SQLite mode only); exposed as `/uploads` |
| `scripts/` | `init-database.js`, `deploy-check.js`, `generate-secrets.js` |
| `supabase/schema.sql` | Reference schema for Postgres/Supabase |
| `index.html` | Legacy/static home alternative; **the running app uses** `GET /` → `src/views/index.ejs` |

---

## 5. Services (detailed)

### 5.1 `DatabaseManager` (`src/services/database.js`)

- Chooses **SQLite** or **Supabase** at construction time.
- Exposes one API for: **books**, **book_blurbs**, **blog_posts**, **orders**, and **file helpers** (`uploadFile`, `getFileUrl`).
- **Public** queries filter by `status` (e.g. published books/posts); **admin** methods return all rows for management UIs.
- SQLite stores `delivery_address` on orders as JSON text; code parses it when reading.

### 5.2 `SupabaseService` (`src/services/supabase.js`)

- Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or anon key as fallback — production should prefer service role for server-side writes).
- Mirrors the same operations as SQLite for app features.
- **Storage**: uploads bytes to a named bucket; `getFileUrl` returns the public URL for display.

### 5.3 `StripeService` (`src/services/stripe.js`)

- Initializes Stripe only if `STRIPE_SECRET_KEY` is set.
- **createPaymentIntent**: amount from book price (öre), currency `sek`, card only, metadata and shipping for the book purchase.
- **verifyWebhookSignature**: for `POST /stripe-webhook` (raw body).
- Publishes key via `getPublishableKey()` for the purchase page.

### 5.4 `ResendService` (`src/services/resend.js`)

- Active when `RESEND_API_KEY` is set.
- Sends the site owner a **contact** message and a **confirmation** to the visitor.
- `isServiceConfigured()` allows the API to succeed with a logged-only path when Resend is not configured.

**Note:** Ensure the `resend` npm dependency is listed in `package.json` if you use this service (the implementation imports the `resend` package).

---

## 6. Main routes (mental map)

**Public pages**

- `/` — Home (`index.ejs`)
- `/book/:id`, `/blog/:id` — Detail pages
- `/purchase/:id` — Checkout UI (Stripe.js when configured)
- `/payment/success`, `/payment/failure` — After redirect from Stripe

**Public APIs (JSON)**

- `GET /api/blog`, `GET /api/books` — Lists for the frontend
- `POST /api/contact` — Contact form (Resend optional)

**Payments**

- `POST /create-payment-intent` — Creates Stripe Payment Intent + pending **order** row
- `POST /stripe-webhook` — Raw body; updates order status on payment events

**Admin** (all under `/admin/…`, `requireAuth` except login)

- Login/logout, dashboard, CRUD for blog and books, blurbs nested under books, **orders** list

**Static**

- `/assets/*`, favicon; `/uploads/*` only when `DATABASE_TYPE=sqlite`

---

## 7. Security and operational techniques

- **Trust proxy** — `app.set('trust proxy', true)` for correct client IP behind a reverse proxy.
- **Helmet** — CSP allows self-hosted assets, Google Fonts, Stripe (`js.stripe.com`, `api.stripe.com`), and Supabase hosts as needed.
- **Rate limits** — Global limiter + stricter **login** limiter + **upload** limiter.
- **Slow down** — Progressive delay after a threshold of requests per window.
- **Sessions** — HTTP-only, `secure` in production, `sameSite: 'strict'`, rolling expiry.
- **Passwords** — Prefer `ADMIN_PASSWORD_HASH` (bcrypt); plain `ADMIN_PASSWORD` is a fallback for initial setup only.
- **Input** — `sanitizeInput` runs `xss` on `req.body` for selected routes.
- **Production** — Compression, disable `x-powered-by`, structured-ish JSON logging when not in development.

---

## 8. Data model (conceptual)

- **blog_posts** — title, excerpt, content, status (`draft` / `published`), timestamps.
- **books** — metadata, cover URL, optional price, status (`draft` / `published` / `coming_soon`), sort order, release date.
- **book_blurbs** — Per-book quotes (name + quotation), tied to `book_id`.
- **orders** — Linked to `book_id`, Stripe payment intent id, customer fields, `delivery_address`, amount/currency, status (e.g. pending/completed/failed).

Schema details: SQLite creation in `scripts/init-database.js`; Postgres in `supabase/schema.sql`.

---

## 9. Frontend integration

- The **live site** is driven by Express + EJS + `assets/`. The homepage and sections may **fetch** `/api/books` and `/api/blog` from `script.js` for dynamic lists (mobile nav, smooth scroll, contact `fetch` to `/api/contact`, etc.).
- **`CONTENT_INTEGRATION.md`** describes a generic “content → API → site” flow; it may mention **artwork** routes that are **not** implemented in `server.js`. Treat the code and this overview as the source of truth for current endpoints.

---

## 10. Running locally

1. `npm install`
2. Copy `.env.example` to `.env` and set variables (database type, secrets, optional Stripe/Resend/Supabase).
3. For SQLite: `npm run init-db` to create tables.
4. `npm run dev` or `npm start` — default port from `PORT` or `3000`.

Admin UI: `/admin/login`. For first-time machine setup see `SETUP_GUIDE.md`.

---

## 11. Production deployment (AWS Lightsail)

The **live application** runs on **AWS Lightsail**: a small VPS-style instance where Node serves this app (typically behind HTTPS, often with a reverse proxy such as Nginx forwarding to the Node `PORT`).

**Why this matters in code:** `server.js` sets `trust proxy` so rate limiting, logging, and `req.ip` stay correct when the public IP is the load balancer or proxy, not the Node process—standard for Lightsail and similar setups.

**Operational detail** lives in the dedicated guides (instance creation, firewall, SSL, process manager, env on the server):

| Document | Contents |
|----------|----------|
| `DEPLOYMENT_READY.md` | Lightsail-oriented checklist and steps |
| `PRODUCTION_SETUP.md` | Production env vars, HTTPS, Lightsail section |
| `scripts/deploy-check.js` | Pre-flight checks before deploy |

Stripe webhooks and public URLs must use the **production domain** configured on Lightsail (see `STRIPE_SETUP.md`).

---

## 12. Where to look next

| Topic | Document / location |
|--------|----------------------|
| Product description (Swedish) | `README.md` |
| **Deployment / Lightsail** | `DEPLOYMENT_READY.md`, `PRODUCTION_SETUP.md` |
| Stripe | `STRIPE_SETUP.md`, `src/services/stripe.js` |
| Resend | `RESEND_SETUP.md`, `src/services/resend.js` |
| Supabase | `supabase/schema.sql`, `src/services/supabase.js` |
| Env vars | `.env.example` |
| All HTTP behavior | `server.js` |

This overview is **informational**; when behavior and docs disagree, prefer **the repository code** and update this file if you change architecture or routes.
