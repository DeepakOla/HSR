# Project: HSR — CNG Cylinder Testing Platform

## 1. System & Runtime Environment

- **Node.js**: `C:\Program Files\nodejs\node.exe` (Node.js v24.22.3, npm v11.19.1).
- **Other NVM runtimes**: Located at `C:\nvm4w\nodejs` (Node.js v20.19.4) — **DO NOT USE**.
- Verified in PowerShell via `$PROFILE` hook prepending `C:\Program Files\nodejs` to `$env:Path`.
- Verification command: `where.exe node; node --version; npm --version`.

---

## 2. Architecture & Data Flow

- **Stack**: Astro 7, React 19 interactive islands, TypeScript, Cloudflare Workers runtime, Cloudflare D1 SQL database, Cloudflare R2 object storage (private & optional), Wrangler, Vitest, Playwright.
- **Data Flow**:
  - Public Client -> Astro Server Routes / Pages -> React Islands (`BookingWizard.tsx`, `ContentPage.astro`)
  - Booking API (`/api/booking/*`, `/api/public/*`) -> Zod Schemas (`schemas.ts`, `vehicle-registration.ts`) -> Booking Engine (`booking-engine.ts`) -> Atomic D1 Batch Writes (`db.batch`)
  - Admin Client -> Astro Admin Pages -> Cloudflare Access JWT Header (`cf-access-jwt-assertion`) -> Web Crypto RS256 Verification (`auth.ts`) -> D1 `staff_users` Role Verification (`requireRole`) -> Admin APIs (`/api/admin/*`)
- **Key Invariants**:
  - Active capacity states: `HELD`, `PENDING_VERIFICATION`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`.
  - Hold expiry auto-expires ONLY `HELD` + `ADVANCE_PENDING` bookings; never auto-release after evidence submission.
  - DB-guarded writes for hold creation (`bookings_capacity_guard`).
  - Preserve snapshot pricing, slot labels, capacity, and config version on each booking.
  - UPI link/QR does not verify payment; evidence and UTR set booking to `PENDING_VERIFICATION`/`EVIDENCE_SUBMITTED`.
  - Pre-write payment gating: Fail-closed before D1 writes if merchant UPI VPA/payee are unconfigured or `SETUP_REQUIRED`.
  - Server-side role and public cylinder count limits (max 6 online); never trust browser.
  - Public APIs must not leak customer PII.

---

## 3. Business Invariants & Defaults

- **Business Name**: Default is **HSR** (not finalised; fully configurable by Owner in `business_settings`).
- **Location**: Default is **Rewari** (not finalised; editable by Owner in `business_settings`).
- **Contact Number**: Default is **+91 9910055355** (editable by Owner).
- **Admin / Owner Email**: **`kumardeepakola@gmail.com`** (role `OWNER` in `staff_users`).
- **Pricing & Advance**:
  - Base: ₹2,500 per cylinder + 18% GST (e.g. 1 cylinder = ₹2,950; 2 cylinders = ₹5,900; 4 cylinders = ₹11,800).
  - Advance: Flat **₹500 per booking** across public online booking (1–6 cylinders).
  - Balance = Total - ₹500.
  - Flat advance stored in `business_settings.flat_advance_paise = 50000`, single source of truth for online bookings.
- **Design Identity**:
  - **Direction A — Professional Industrial Trust** (industrial engineering identity, not green-energy/eco branding).
  - High-contrast, clean industrial palette (Navy/Industrial Blue `#1E40AF`, Slate `#475569`, Action Amber/Orange `#EA580C`, Clean Neutral `#EFF6FF`).
  - Realistic facility images kept pending; placeholder imagery labeled clearly.

---

## 4. Feature Inventory

| # | Feature | Description | Milestone | Status |
|---|---------|-------------|-----------|--------|
| 1 | Vehicle Registration Validation | Normalization & regex validation for Indian State & Bharat (BH) series | M1 | ✅ COMPLETE |
| 2 | Flat ₹500 Advance & Single Source Pricing | Flat ₹500 advance per booking in `business_settings.flat_advance_paise`; balance = total - ₹500 | M2 | ✅ COMPLETE |
| 3 | Pre-Write UPI Payment Gating | Prevent D1 hold creation when UPI VPA/payee are `SETUP_REQUIRED`, routing cleanly to Phone/WhatsApp | M2 | ✅ COMPLETE |
| 4 | Server-Side Public Cylinder Limit | Enforce max 6 cylinders on public APIs (`source === 'WEB'`) while retaining 1–12 for receptionists | M2 | ✅ COMPLETE |
| 5 | Single-Tap Date Progression | Instant advancement to vehicle step upon date selection; remove redundant continue button | M3 | ✅ COMPLETE |
| 6 | Vehicle Selection & Truck Preselection | Dropdown: Car, Taxi, Tempo, Van, LCV, Truck, Bus, Other; Truck auto-selects 4 cylinders | M3 | ✅ COMPLETE |
| 7 | Public 1–6 Cylinder Dropdown & Contact Routing | Public dropdown shows 1 to 6 cylinders; "More than 6" halts online self-service with contact support card | M3 | ✅ COMPLETE |
| 8 | Linked Time Dropdowns & Finish Time | Hour dropdown first, Exact Start Time second; dynamic schedule intervals (15/20m); finish time display | M3 | ✅ COMPLETE |
| 9 | Staff / Admin Login Footer Link | Discreet bilingual link in footer to `/admin/login/`; direct links to Owner & Reception | M4 | ✅ COMPLETE |
| 10 | Receptionist & Register Validation Parity | Symmetrically apply vehicle registration validation to receptionist manual booking and cylinder register | M4 | ✅ COMPLETE |
| 11 | Safe Structured Owner Content CMS | Owner Console Section 04 for bilingual page editing (About, Services, How it works, Contact) with audit log | M5 | ✅ COMPLETE |
| 12 | Professional Industrial UI/UX Redesign + Blog + Local SEO | Direction A design system: industrial typography, tokens, Astro collections blog, Schema.org | M6 | ✅ COMPLETE |
| 13 | Comprehensive E2E Test Suite & Security Audit | 4-tier test suite + Cloudflare Security Audit independent assessment | M7 | ✅ COMPLETE |
| 14 | Preview Readiness & Verification | Safe Preview-only deployment verification; zero production mutation | M8 | READY |

---

## 5. Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Runtime Environment Verification | Node.js v24.22.3 (`C:\Program Files\nodejs\node.exe`) verified & operational | none | ✅ COMPLETE |
| M1 | Vehicle Registration Validation Module | `src/lib/vehicle-registration.ts`, 73 Vitest tests passing | M0 | ✅ COMPLETE |
| M2 | Pricing Engine & ₹500 Flat Advance | `0006_flat_advance.sql`, `pricing.ts`, `create-hold.ts`, pre-write payment gating | M0, M1 | ✅ COMPLETE |
| M3 | Customer Booking Wizard Overhaul | `BookingWizard.tsx` (1-tap date, vehicle/truck, 1-6 cyl, linked time dropdowns) | M1, M2 | ✅ COMPLETE |
| M4 | Administrative Navigation & Validation Parity | `BaseLayout.astro` footer link, `ReceptionDashboard.tsx`, `RegisterConsole.tsx` | M1, M2 | ✅ COMPLETE |
| M5 | Bilingual Owner Content CMS | `/api/admin/content.ts`, `OwnerSettings.tsx`, `ContentPage.astro`, `localized_content` | M3, M4 | ✅ COMPLETE |
| M6 | Professional Industrial UI/UX Redesign + Blog + Local SEO | Direction A tokens (`design-tokens.css`), responsive layouts, blog collections, Schema.org | M3, M5 | ✅ COMPLETE |
| M7 | Security Audit & Quality Verification | Independent defensive security audit, API trust boundaries, concurrency, and PII protection | M1–M6 | ✅ COMPLETE |
| M8 | Preview Deployment Readiness | Preview D1 migration verification, `staff_users` check (`kumardeepakola@gmail.com`) | M7 | READY |

---

## 6. Interface Contracts

### `src/lib/vehicle-registration.ts` ↔ API & Form Consumers
```typescript
export interface VehicleRegistrationResult {
  valid: boolean;
  normalized: string;
  error?: string;
  format?: 'STATE_SERIES' | 'BH_SERIES';
}

export function normalizeVehicleRegistration(value: string): string;
export function validateVehicleRegistration(value: string, locale?: 'en' | 'hi'): VehicleRegistrationResult;
```

### `src/pages/api/booking/create-hold.ts` ↔ Public Client
- Request: `POST /api/booking/create-hold`
- Input: JSON containing `categoryId`, `slotSnapshotId`, `customerName`, `customerPhone`, `vehicleRegistration`, `vehicleType`, `vehicleModel`.
- Behavior:
  1. Validates `vehicleRegistration` via `validateVehicleRegistration`.
  2. Queries category: If `source === 'WEB'` and `cylinderCount > 6`, rejects with HTTP 400 (`PUBLIC_CYLINDER_LIMIT_EXCEEDED`).
  3. Pre-write payment check: Queries `business_settings`. If `vpa_id` or `vpa_payee_name` is missing or `SETUP_REQUIRED`, rejects with HTTP 422 (`ONLINE_PAYMENT_UNAVAILABLE`) with phone/WhatsApp booking instructions. DOES NOT write to D1.
  4. Commits hold via `createHold(db, ...)` with atomic slot allocation.

### `/api/admin/content.ts` ↔ Owner Console (`OwnerSettings.tsx`)
- Authentication: `requireRole(request, env, ['OWNER'])` + `validateOrigin(request)`.
- Owner email: `kumardeepakola@gmail.com`.
- Data format:
  ```json
  {
    "pageKey": "about" | "services" | "how-it-works" | "contact",
    "locale": "en" | "hi",
    "title": "string",
    "content": {
      "intro": "string",
      "sections": [
        {
          "heading": "string",
          "paragraphs": ["string"],
          "listItems": ["string"]
        }
      ]
    }
  }
  ```
- Output: Stored as structured JSON string in `localized_content.body`. Safe rendering in `ContentPage.astro` without `dangerouslySetInnerHTML`.
