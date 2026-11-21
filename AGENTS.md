# Agent Invariants

## 1. Booking and Capacity Invariants

- Active capacity states are `HELD`, `PENDING_VERIFICATION`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`.
- Hold expiry only auto-expires `HELD` + `ADVANCE_PENDING` bookings; never auto-release bookings after evidence submission.
- Use atomic DB-guarded writes for hold creation. Overlapping cylinder work-unit collisions must fail atomically.
- Preserve snapshot pricing, slot labels, capacity, and config version on every booking record.
- Public self-service booking strictly limits cylinder count to 1–6 (`source === 'WEB'`). Reception desk retains 1–12 cylinder capability.
- Selecting **Truck** automatically preselects 4 cylinders (editable by user).

## 2. Payment and Evidence Invariants

- UPI link/QR generation does NOT settle or verify payment.
- Customer evidence submission (12-digit UTR or screenshot) sets booking to `PENDING_VERIFICATION` / `EVIDENCE_SUBMITTED`.
- Settlement is verified only via bank alert UTR auto-reconciler or staff manual verification in reception desk.
- R2 evidence storage is private and optional. When unavailable or unbound (e.g., Previews), screenshot upload must be disabled without blocking UTR reference entry.

## 3. Security and Auth Invariants

- Protect all `/admin/*`, `/staff/*`, and management APIs server-side.
- Cloudflare Access RS256 JWT verification guards Owner and Receptionist identities in production.
- Customer Workspace (`/user/*`) is guarded by 6-digit SMS OTP session tokens in cookies.
- Never trust role, identity, or pricing submitted from the browser client.
- Public APIs must never leak customer PII (phone, full name, address, payment details).

## 4. Cloudflare Infrastructure & Deployment Safety Gates

- **Cloudflare Account Subdomain**: `kumardeepakola.workers.dev`
- **Cloudflare Access Team Domain**: `kumardeepakola.cloudflareaccess.com`
- **Worker Name**: `hsr`
- **Live Production URL**: `https://hsr.kumardeepakola.workers.dev`
- **Preview Worker URL**: `https://copilot-build-cng-cylinder-hydro-testing-website-hsr.kumardeepakola.workers.dev`
- **Production D1 Database**: `hsr_green_energy_prod` (`2167157a-4c00-4063-b183-c0a5bd12ed5d`)
- **Preview D1 Database**: `hsr_green_energy_preview` (`3220c6e5-64ff-4874-9d5d-0e237f5af9ad`)
- **Production R2 Storage**: `hsr-prod` (`EVIDENCE_BUCKET`) — unbound in Previews.
- **Workers Builds Pipeline**: Cloudflare Workers Builds deploys automatically from GitHub `main`.
- **Gating Invariant**: Keep development work on `copilot/build-cng-cylinder-hydro-testing-website`. Do not push to `main`, merge PR #1, run remote migrations, or deploy Production without the user's explicit prior approval.

## 5. Frontend, Design & Simplicity (Ernest Philosophy)

- **Simplicity Reference**: Follow the clarity, zero-clutter layout, and effortless usability of Ernest. Keep customer frontend strictly focused on what users need to understand, decide, and act.
- **Precision Hydro Test Tokens**: Certified industrial palette (Deep Navy `#0A1128`, Safety Orange `#EA580C` for conversion, Steel Blue `#0284C7` for telemetry, Plus Jakarta Sans for headings, Inter for body/numbers).
- **No Technical Jargon**: Use "Seats / Appointment Slots / Testing Station" — NEVER use "Bay" or "Bays" on customer-facing pages.
- **Transparent Pricing**: Flat ₹500 online booking advance with dynamically calculated remaining balance (`Total - ₹500`).
- **No Mockup Leakage**: Never reintroduce sample Karnataka/Bengaluru references (`KA-` plates, `BLR`, `PESO #941`), fake Vahan sync badges, or unverified regulatory claims.
- **Configurable Anchors**: Business name defaults to "HSR", location defaults to "Rewari" (editable via Owner Console / `business_settings`).

## 6. Verification Commands

- `npm run test` (Vitest unit & integration test suites, 29 suites, 536 tests passing 100%)
- `npm run typecheck` (Astro type diagnostics, 211 files, 0 errors)
- `npm run lint` (ESLint, 0 errors)
- `npm run build` (Production SSR bundle & prerendered routes, 0 errors)
- `npm run test:e2e` (Playwright E2E browser tests across desktop and mobile viewports)


