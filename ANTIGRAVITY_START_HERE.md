# HSR CNG Platform — Developer & Agent Onboarding

## 1. System & Runtime Environment

- **Required Node.js Executable**: `C:\Program Files\nodejs\node.exe` (Node.js v24.22.3, npm v11.19.1).
- **Important**: Other installations are managed by NVM (`C:\nvm4w\nodejs\node.exe` v20.19.4) and **MUST NOT** be used.
- Node.js is already installed. Do not attempt to install, reinstall, or change Node versions.
- Terminal sessions resolve `C:\Program Files\nodejs` first via the configured PowerShell profile (`$PROFILE`).
- Verify anytime with:
  ```powershell
  where.exe node
  node --version
  npm --version
  ```
  Expected first entry: `C:\Program Files\nodejs\node.exe` returning `v24.22.3`.

---

## 2. Business & Brand Identity Invariants

1. **Business Name**:
   - The business name is **NOT finalised**. Do not hardcode "HSR Green Energy" as a permanent brand name.
   - The default display name is **HSR** until changed.
   - Must remain fully configurable by the Owner in `business_settings` (English & Hindi).
2. **Location / Operational City**:
   - The final location is **NOT finalised**.
   - Default city value is set to **Rewari** in settings, fully editable by the Owner.
   - Any external regulatory/accreditation claims remain `SETUP_REQUIRED` until formally verified.
3. **Contact Phone & WhatsApp**:
   - Default contact number is **+91 9910055355** until updated by the Owner/Admin in settings.
4. **Owner / Admin Identity**:
   - Owner email for Cloudflare Access and `staff_users` table: **`kumardeepakola@gmail.com`**.
   - Role: `OWNER`.
   - Never bypass Cloudflare Access JWT validation or invent dummy roles.

---

## 3. Commercial & Booking Rules

1. **Advance Amount & Single Source of Truth**:
   - The advance amount is **authoritative per vehicle category** in `vehicle_categories.advance_paise`.
   - Global flat advance fallbacks are retired.
   - **Strict 3-State Advance Resolution**:
     - `advance_paise > 0`: Require exact advance via UPI (e.g., ₹500 for 1 cylinder, ₹1,000 for 4 cylinders). Balance = Total - Advance.
     - `advance_paise === 0`: Free online reservation ("Book Free — Pay at Station"). Status = `CONFIRMED` + `PAID_AT_COUNTER`.
     - `advance_paise === null`: Self-service online hold disabled; customer routed to Phone/WhatsApp consultation (+91 9910055355).
   - Zero hardcoded fallbacks: never use `|| 50000` or `?? 50000`.
   - All historical bookings preserve their immutable price snapshots.
2. **Pricing Structure**:
   - Base service charge: ₹2,500 per CNG cylinder.
   - Configurable GST: 18% calculation (`FIXED_GST_RATE_BPS = 1800`).
   - 1 cylinder = ₹2,500 + ₹450 GST = ₹2,950 total.
   - 2 cylinders = ₹5,000 + ₹900 GST = ₹5,900 total.
   - 4 cylinders = ₹10,000 + ₹1,800 GST = ₹11,800 total.
3. **Cylinder Selection & Limits**:
   - **Public online booking dropdown**: 1, 2, 3, 4, 5, 6 cylinders, plus "More than 6".
   - "More than 6" halts self-service booking and provides Phone/WhatsApp contact card (+91 9910055355).
   - Server-side public API strictly rejects `cylinderCount > 6` for `source === 'WEB'`.
   - Internal reception desk retains 1–12 cylinder booking capability.
4. **Vehicle Selection**:
   - Dropdown: Car, Taxi, Tempo, Van, LCV, Truck, Bus, Other.
   - Optional vehicle make/model field.
   - Selecting **Truck** automatically preselects **4 CNG cylinders** (editable by user).
5. **Payment Gating**:
   - Pre-write fail-closed check: No `HELD` booking is created if UPI VPA (`vpa_id`) or payee name (`vpa_payee_name`) are unconfigured or `SETUP_REQUIRED`.
   - Routes user cleanly to Phone/WhatsApp booking if online payment is unconfigured.

---

## 4. Architecture, Navigation & Page Map

The frontend follows an Ernest-inspired simplicity philosophy: direct actions, clean typography, zero visual clutter, and backgrounded operational complexity.

```
/ (Root) -> 302 redirect based on Accept-Language cookie (hsr_lang) to /en/ or /hi/
├── /en/ & /hi/ (Public Customer Experience)
│   ├── index.astro (Hero, Retest Due Checker, Inline 3-Step Booking Wizard, Pricing, Trust Pillars)
│   ├── book.astro (Dedicated standalone booking wizard)
│   ├── about.astro, contact.astro, services.astro, how-it-works.astro (CMS-managed)
│   ├── terms.astro (Terms & Conditions — PESO Rule 35 & cylinder condemnation)
│   ├── privacy.astro (Privacy Policy — DPDP Act 2023 & statutory retention)
│   ├── refund.astro (Cancellation & Refund Policy — 12hr free cancellation SLA)
│   ├── disclaimer.astro (Statutory & Technical Safety Disclaimer)
│   ├── blog/ (Static prerendered educational articles on PESO Rule 35 and compliance)
│   └── status/ (Public booking reference tracking via bookingCode + statusToken)
├── /cng/ (Industrial Pillars & Retest Due Portal)
│   ├── index.astro (CNG hydro testing guides with mobile sliding drawer)
│   └── cylinder-test.astro (Consolidated industrial testing landing with 2-path Retest Due launcher)
├── /login/ (Unified Sign-In Portal)
│   ├── Vehicle Owner Workspace (SMS OTP challenge)
│   ├── Plant Operations (Staff Email & PIN)
│   └── Station Owner Executive (Cloudflare Access zero-trust console)
├── /user/ (Customer Workspace)
│   ├── index.astro (Vehicle dossiers, due date timeline, upcoming appointments, payment receipts)
│   └── book.astro, documents.astro, history.astro, payments.astro, profile.astro, vehicles.astro
├── /admin/ (⚡ HSR Management Portal — Zen Dock Layout)
│   ├── index.astro & owner.astro (Executive KPI dashboard, commercial controls, WhatsApp mode)
│   ├── reception.astro (Daily check-in desk, slot queue, 1–12 cylinder manual bookings)
│   ├── cylinder-register.astro (Statutory PESO Form GCT compliance register)
│   ├── vouchers.astro (Discount coupon management with vehicle registration search)
│   ├── records.astro, finance.astro (Zoho Books GST export), cms.astro, settings.astro, seo.astro
└── Deprecated / 301 Consolidated Routes
    ├── /app/* -> 301 to /user/*
    ├── /directory/* -> 301 to /cng/cylinder-test/#nearby-stations
    ├── /tools/cng-expiry-checker/ -> 301 to /cng/cylinder-test/?action=check-due-date#retest-checker
    └── /en/check-expiry/ & /hi/check-expiry/ -> 301 to /cng/cylinder-test/?action=check-due-date#retest-checker
```

---

## 5. D1 Database Schema & Migration Sequence

The database schema is strictly version-controlled in `migrations/`:

| Migration | Purpose | Key Tables / Columns |
|---|---|---|
| `0001_init.sql` | Core schema baseline | `business_settings`, `weekly_schedule`, `slot_templates`, `vehicle_categories`, `customers`, `vehicles`, `bookings` |
| `0002_capacity_guard.sql` | High-concurrency guard | Trigger `bookings_capacity_guard` preventing double-allocations |
| `0003_amount_paid.sql` | Payment ledger tracking | `amount_paid_paise`, payment state audit columns |
| `0004_schedule_versions.sql` | Schedule versioning | `schedule_versions`, `date_overrides` for holiday capacity |
| `0005_cylinder_work_units.sql` | Work-unit capacity engine | `booking_slot_allocations`, consecutive time slot locking |
| `0006_flat_advance.sql` | Flat ₹500 advance engine | `flat_advance_paise` setting, single source of truth |
| `0007_retest_reminders.sql` | Retest reminder queue | `retest_reminders` for 3-year automated customer follow-ups |
| `0008_unified_hsr_schema.sql` | Enterprise unified monolith | `parties`, `contact_phones`, `booking_groups`, `payments`, `party_vehicle_access` |
| `0009_whatsapp_and_promotions.sql` | WhatsApp & Promo codes | `whatsapp_mode` (DIRECT vs API), `discount_vouchers`, `promo_banner` |
| `0010_zero_cost_expansion_cms_zoho_upi.sql` | Zero-cost business suite | Zoho Books CSV export mapping, zero-dependency NPCI UPI QR |
| `0011_pricing_visibility_and_owner_legal_name.sql` | Commercial transparency | Per-category public visibility flags, statutory owner legal name |
| `0012_eliminate_setup_required_defaults.sql` | Fail-closed defaults | Eliminates unsafe mock strings from production schema |
| `0013_seo_tracker_and_social_media.sql` | Social & SEO tracking | Social media links (FB, IG, YT, X, WA), Google Tag Manager / Analytics IDs |
| `0014_brand_logo_setting.sql` | Configurable branding | `brand_logo_url` in `business_settings` |
| `0015_per_category_advance_and_gbp.sql` | Advance authority & GBP | Per-category advance authority, Google Place ID, Maps URL, Review link, Geo coordinates |

---

## 6. Cloudflare Infrastructure & Deployment Pipeline

### Resource Manifest

| Environment | Purpose | Worker / Database | ID / Binding |
|---|---|---|---|
| **Production** | Live Worker | `hsr` | Subdomain: `kumardeepakola.workers.dev` |
| **Production** | Live D1 Database | `hsr_green_energy_prod` | `2167157a-4c00-4063-b183-c0a5bd12ed5d` |
| **Production** | R2 Evidence Storage | `hsr-prod` | Binding: `EVIDENCE_BUCKET` |
| **Preview** | Isolated Preview D1 | `hsr_green_energy_preview` | `3220c6e5-64ff-4874-9d5d-0e237f5af9ad` |
| **Access** | Zero-Trust Team | Cloudflare Access | `kumardeepakola.cloudflareaccess.com` |

### Why Live Site Differs from Development Branch

- **Cloudflare Workers Builds** is connected directly to GitHub `https://github.com/DeepakOla/HSR` on the **`main`** branch.
- Development work is strictly performed on **`copilot/build-cng-cylinder-hydro-testing-website`**.
- Per safety rules in `AGENTS.md`, commits on the development branch are **never merged into `main` automatically**.
- When the owner approves a release:
  ```powershell
  git checkout main
  git merge copilot/build-cng-cylinder-hydro-testing-website --ff-only
  git push origin main
  ```
  Pushing to `main` triggers Cloudflare Workers Builds to deploy the updated release to `https://hsr.kumardeepakola.workers.dev`.

---

## 7. Verification Commands & Suite Baseline

```powershell
npm run typecheck   # Astro check across all 211 files (0 errors, 0 warnings)
npm run lint        # ESLint code quality (0 errors, 0 warnings)
npm run test        # Vitest unit & integration suites (29 suites, 536 tests passing 100%)
npm run build       # Astro SSR Cloudflare Worker bundle + static prerendered routes (0 errors)
npm run test:e2e    # Playwright browser tests across viewports (360px, 390px, 1440px)
```

---

## 8. Milestone Progress Status

- [x] **M1: Vehicle Registration Module**: State and Bharat (BH) series normalization & validation with localized bilingual errors.
- [x] **M2: Pricing Engine & ₹500 Flat Advance**: Single source of truth calculation with ₹500 flat advance per booking and fail-closed pre-write UPI payment gate.
- [x] **M3: Customer Booking Wizard**: Single-tap date advance, 8 vehicle types, Truck 4-cylinder auto-select, public 1–6 cylinder limit, linked time slot calculations.
- [x] **M4: Administrative Navigation & Validation Parity**: Footer staff login link, reception & register vehicle registration validation parity.
- [x] **M5: Bilingual Owner Content CMS**: Owner Console for managing editable page content in English and Hindi with audit log.
- [x] **M6: Professional Industrial UI/UX Redesign + Blog + Local SEO**: Direction A tokens (`design-tokens.css`), Astro Content Collections blog, static route prerendering, Schema.org AutoRepair JSON-LD.
- [x] **M7: Defensive Security Audit**: Cloudflare Access RS256 token verification, RBAC role separation, public API PII exposure prevention, CSRF origin verification, D1 concurrency and hold expiry invariants verified.
- [x] **M8: Preview Deployment Readiness v0.0.1**: Cloudflare Preview build fixes, isolated preview D1 database, strictly unbound R2 bucket in preview, defensive security headers.
- [x] **M9: Unified Portal & Monolith Schema v0.0.2**: Unified 3-tab sign-in (`/login/`), Customer Workspace (`/user/`), and enterprise relational schema (`0008_unified_hsr_schema.sql`).
- [x] **M10: Zero-Cost Business Expansion**: Dual-mode WhatsApp (`DIRECT` vs `API`), NPCI UPI QR generator, Zoho Books GST export, promotional voucher management (`0009` & `0010` migrations).
- [x] **M11: Industrial Zen Dock Portal**: `AdminLayout.astro` with collapsible left dock, real-time station telemetry, statutory PESO Form GCT register (`/admin/cylinder-register/`), and voucher vehicle lookup.
- [x] **M12: Performance, Usability & Defect Audit v0.0.3**: Dynamic advance pricing balances (`Total - ₹500`), complete elimination of "bay" jargon, decluttered registration input, custom accessible mobile navigation drawers, 301 route deprecations, Vite MIME crash resolution, and 100% green test baseline.

