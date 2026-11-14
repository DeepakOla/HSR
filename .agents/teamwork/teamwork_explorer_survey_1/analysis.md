# HSR Green Energy: Comprehensive Product, UI/UX, and Architectural Survey Report

**Author**: Agent A — Product and UI/UX Architect (`teamwork_explorer`)  
**State Folder**: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_1`  
**Working Directory**: `c:\Users\HP\Downloads\HSR CNG`  
**Date**: November 12, 2026  
**Status**: Read-Only Survey & Architectural Investigation Complete  

---

## Executive Summary

A comprehensive architectural and UI/UX survey of the HSR Green Energy repository (`DeepakOla/HSR`, branch `copilot/build-cng-cylinder-hydro-testing-website`) was conducted under strict read-only constraints. 

The application is an Astro 7 server-rendered platform deployed via Cloudflare Workers with React 19 interactive islands, Cloudflare D1 SQL database, and private Cloudflare R2 object storage. While the core scheduling engine, capacity allocation triggers, and basic layout structure are sound, significant gaps and UX friction points exist across the customer booking journey, public content rendering, administrative content management, vehicle registration validation, and staff access navigation.

This report establishes the baseline observations, logic chains, UI/UX design specifications, and a precise, file-by-file implementation plan for Phase B.

---

## 1. Public Pages, Design System, Layout, and Usability Survey

### 1.1 Route Inventory and Architecture

| Route | Implementation File | Rendering | Locale | Purpose & Current State |
|---|---|---|---|---|
| `/` | `src/pages/index.astro` | SSR (302) | N/A | Redirects immediately to `/en/` |
| `/en/` | `src/pages/en/index.astro` | SSR | English | Homepage with hero, features, and booking CTA |
| `/hi/` | `src/pages/hi/index.astro` | SSR | Hindi | Localized Hindi homepage |
| `/en/about/` | `src/pages/en/about.astro` | SSR | English | Reads from `localized_content`; displays generic `SETUP_REQUIRED` fallback |
| `/hi/about/` | `src/pages/hi/about.astro` | SSR | Hindi | Hindi About page; displays `SETUP_REQUIRED` fallback |
| `/en/services/` | `src/pages/en/services.astro` | SSR | English | Services page; displays `SETUP_REQUIRED` fallback |
| `/hi/services/` | `src/pages/hi/services.astro` | SSR | Hindi | Hindi Services page; displays `SETUP_REQUIRED` fallback |
| `/en/how-it-works/` | `src/pages/en/how-it-works.astro` | SSR | English | Workflow explainer; displays `SETUP_REQUIRED` fallback |
| `/hi/how-it-works/` | `src/pages/hi/how-it-works.astro` | SSR | Hindi | Hindi Workflow explainer; displays `SETUP_REQUIRED` fallback |
| `/en/contact/` | `src/pages/en/contact.astro` | SSR | English | Contact details; suppresses fields marked `SETUP_REQUIRED` |
| `/hi/contact/` | `src/pages/hi/contact.astro` | SSR | Hindi | Hindi Contact details; suppresses fields marked `SETUP_REQUIRED` |
| `/en/check-expiry/` | `src/pages/en/check-expiry.astro` | SSR | English | Cylinder retest due date calculator (3-year cycle) |
| `/hi/check-expiry/` | `src/pages/hi/check-expiry.astro` | SSR | Hindi | Hindi cylinder retest calculator |
| `/en/book/` | `src/pages/en/book.astro` | SSR + React Island | English | 5-step booking wizard (`BookingWizard.tsx`) |
| `/hi/book/` | `src/pages/hi/book.astro` | SSR + React Island | Hindi | Localized 5-step booking wizard (`BookingWizard.tsx`) |
| `/en/status/` | `src/pages/en/status/index.astro` | SSR | English | Secure token-authenticated booking status viewer |
| `/hi/status/` | `src/pages/hi/status/index.astro` | SSR | Hindi | Hindi secure token-authenticated booking status viewer |
| `/admin/login/` | `src/pages/admin/login.astro` | Static/SSR | English only | Staff entry point; links to Reception Desk and Owner Console |
| `/admin/owner/` | `src/pages/admin/owner.astro` | SSR + React Island | English/Hindi | Cloudflare Access protected Owner Console (`OwnerSettings.tsx`) |
| `/admin/reception/` | `src/pages/admin/reception.astro` | SSR + React Island | English/Hindi | Reception Desk (`ReceptionDashboard.tsx`) |
| `/admin/register/` | `src/pages/admin/register.astro` | SSR + React Island | English/Hindi | Completed cylinder testing register (`RegisterConsole.tsx`) |

### 1.2 Design Tokens and Visual System (`BaseLayout.astro`)

The visual design system is defined in `src/layouts/BaseLayout.astro` (lines 31–61):

- **Color Tokens**:
  - `--bg: #f8f9f7`: Subtle tinted warm-gray neutral background.
  - `--surface: #fff`: Pure white surface for content cards, inputs, and navigation headers.
  - `--text: #1e2428`: High-contrast slate charcoal for optimal legibility.
  - `--muted: #4f5960`: Muted gray for captions, subtitles, and secondary indicators (meets WCAG AA 4.5:1 contrast against `#fff`).
  - `--brand: #0f4a34`: Deep industrial evergreen representing clean CNG energy and authority.
  - `--accent: #f5a623`: Warm amber accent for badges and high-visibility indicators.
  - `--border: #d9e0dc`: Crisp border dividing structural sections and card containers.
  - `--radius: 0.5rem`: Consistent 8px rounding across buttons, cards, and input controls.
- **Typography**:
  - System font stack: `system-ui, -apple-system, sans-serif`. Fast zero-network cold load, reliable cross-device rendering in English and Devanagari Hindi.
  - Baseline size: Base 16px body, 1.5 line height, clamp scaling for headings (`clamp(1.8rem, 4vw, 2.8rem)` on hero).
- **Interactive Affordance & Accessibility**:
  - Keyboard focus: `:focus-visible { outline: 3px solid #1f7ae0; outline-offset: 2px; }` providing distinct, accessible focus rings.
  - Touch targets: CTA buttons define `min-height: 56px; padding: 0.8rem 1.2rem`, exceeding WCAG 44×44px minimum touch target requirements.

### 1.3 Navigation and Layout Usability Gaps

1. **Header Navigation**:
   - `BaseLayout.astro` renders 7 flat navigation links (`Home`, `Services`, `How it works`, `Check expiry`, `Book`, `Contact`, `About`) plus business title and language switch pill.
   - On screens `<= 768px`, CSS rules switch `.topbar` to `flex-direction: column; align-items: flex-start;`. On compact mobile devices (<360px width), the 7 links wrap densely, creating visual clutter.
2. **Footer Deficiency**:
   - `BaseLayout.astro` (lines 84–89) currently renders only:
     ```html
     <footer>
       <div class="container section">
         <p>{businessName}</p>
         <p>{locale === 'en' ? 'Owner-managed details may be marked SETUP_REQUIRED until configured.' : '...'}</p>
       </div>
     </footer>
     ```
   - **Critical Missing Elements**:
     - No Staff / Admin Login link.
     - No structured multi-column navigation (Quick Links, Services, Center Hours).
     - No copyright notice, disclaimer, or verified PESO regulatory notice.
     - No direct emergency or phone contact fallback.

---

## 2. Customer Booking Journey: Detailed Component & Flow Audit

The customer booking journey is implemented in `src/components/booking/BookingWizard.tsx` (394 lines), loaded as an interactive React island on `/en/book/` and `/hi/book/`.

### 2.1 Step 1 — Date Selection Audit

- **Current Flow**:
  - Lines 222–262 in `BookingWizard.tsx`.
  - Monthly calendar grid renders day buttons.
  - Clicking an available date executes `selectDate(day)`, setting state `date = day` and highlighting the date cell.
  - **Friction Point**: The wizard does NOT advance. The user is required to look below the calendar and tap a separate button:
    `<button className="cta cta-primary" onClick={() => setStep(2)}>{labels.next}</button>`.
  - Mobile user testing reveals users repeatedly tap the date button expecting instant progression, causing confusion.
- **Architectural Specification for Phase B**:
  - Implement single-tap progression: Tapping any selectable, available date immediately sets the date and advances to Step 2 (`setStep(2)`).
  - Remove the redundant Continue button from Step 1.
  - Keep past, unbooked, closed, or zero-capacity dates strictly disabled (`disabled={!hasAvailability || !inRange}`).
  - Maintain full keyboard accessibility (`Enter` / `Space` on the focused date button triggers progression).

### 2.2 Step 2 — Vehicle Selection Audit

- **Current Flow**:
  - Lines 264–283 in `BookingWizard.tsx`.
  - Vehicle type dropdown populated with: `['Car', 'Taxi', 'Tempo', 'Van', 'LCV', 'Truck', 'Bus', 'Other']`.
  - Selecting `Truck` runs `setCylinderCount(4)` and displays a helper message: *"Truck selected: 4 CNG cylinders are preselected. You can change this."*
  - Optional `vehicleModel` text input exists (`Maruti WagonR, Tata 407, etc.`).
- **Phase B Refinements**:
  - Label question updated to match brief precisely: *"Which vehicle do you have?"* / *"आपका वाहन कौन सा है?"*.
  - When vehicle is `Truck`, preselect 4 cylinders; allow the user to modify the count in Step 3 if needed.
  - Ensure the transition from Step 1 lands focus cleanly on the vehicle dropdown for screen reader and keyboard accessibility.

### 2.3 Step 3 — Number of Cylinders & Pricing Model Audit

- **Current Flow**:
  - Lines 285–316 in `BookingWizard.tsx`.
  - Currently exposes counts from 1 to 12 via `Array.from({ length: 12 }, (_, index) => index + 1)` and a "More than 12" option.
  - Advance calculation reads `category.advancePaise` directly from database records, where some counts have `NULL` or outdated advances.
- **Requirements & Invariants (Section 5.1 & 5.2)**:
  1. **Strict 1–6 Online Dropdown**:
     - The public customer dropdown must offer ONLY:
       - 1 cylinder
       - 2 cylinders
       - 3 cylinders
       - 4 cylinders
       - 5 cylinders
       - 6 cylinders
       - More than 6
     - Selecting "More than 6" terminates self-service online booking and displays a clear call/WhatsApp routing block directing the customer to contact the testing center.
  2. **Server-Side Boundary Enforcement**:
     - Do not merely hide options in the UI. Update `src/pages/api/public/availability.ts` to restrict `cylinderCount` to `z.coerce.number().int().min(1).max(6)`.
     - In `src/pages/api/booking/create-hold.ts` and `src/lib/booking-engine.ts`, verify that incoming `source === 'WEB'` requests have `categoryRow.cylinderCount <= 6`. Tampered payloads requesting 7+ cylinders must be rejected with HTTP 400.
     - Preserve full 1–12 cylinder capability in `src/components/admin/ReceptionDashboard.tsx` for receptionist phone/walk-in bookings.
  3. **Pricing and ₹500 Flat Advance**:
     - Base rate: ₹2,500 per cylinder.
     - GST: 18% (e.g., ₹450 for 1 cylinder, ₹900 for 2, ₹1,800 for 4).
     - Total: 1 cyl = ₹2,950; 2 cyl = ₹5,900; 4 cyl = ₹11,800.
     - **Advance: Fixed at ₹500 per booking** across all cylinder counts 1–6 (not ₹500 per cylinder).
     - Remaining balance = `totalPricePaise - 50000`.
     - Display must be completely identical across Step 3 (Cylinder selection), Step 5 (Customer confirmation), and Step 5 Result (Booking confirmation).
  4. **Payment Gate Protection**:
     - If `vpa_id` or `vpa_payee_name` in `business_settings` is missing or `SETUP_REQUIRED`, online booking must disable hold creation and display a phone/WhatsApp booking route.

### 2.4 Step 4 — Time Selection Audit (Linked Dropdowns)

- **Current Flow**:
  - Lines 318–348 in `BookingWizard.tsx`.
  - Currently displays a flat vertical list of buttons for all available appointment slots on the date.
  - With 20-minute intervals over an 8-hour operating window, up to 24 buttons are rendered sequentially. On mobile devices, this forces excessive vertical scrolling and poor scanability.
- **Phase B Architectural Redesign (Section 5.3)**:
  - Replace the flat button list with **two linked dropdowns**:
    1. **Dropdown 1: Select Hour**:
       - Lists all distinct hours from opening time to closing time that contain at least one valid appointment start time for the selected cylinder count.
       - Format: `6 AM`, `7 AM`, `8 AM`, `9 AM` (English) / `सुबह 6 बजे`, `सुबह 7 बजे` (Hindi).
       - Automatically generated from dynamic schedule data (never hardcoded).
    2. **Dropdown 2: Select Exact Starting Time**:
       - Enabled only after an hour is selected.
       - Populated with exact starting times within that hour (e.g., `06:00`, `06:20`, `06:40` for 20-min interval; `06:00`, `06:15`, `06:30`, `06:45` for 15-min interval).
       - Each option explicitly displays the start time and the calculated finish time: e.g., `06:00 – 08:00 (Finishes at 08:00)`.
  - **Consecutive Work-Unit Validation**:
    - The options must reflect contiguous allocation: a 6-cylinder vehicle requires 6 consecutive work units (120 minutes at 20-min interval). If any unit in the run is booked or crosses a closed period, that start time must NOT appear in the dropdown.

### 2.5 Vehicle Registration Number Validation & Normalization

- **Current State**:
  - Client (`BookingWizard.tsx` line 356 & 366): Only executes `setRegistration(event.target.value.toUpperCase())` and checks `registration.trim().length >= 4`.
  - Server (`schemas.ts` line 12): `vehicleRegistration: z.string().trim().min(4).max(20)`.
  - Normalization (`utils.ts` lines 27–29): `value.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')`.
  - Vulnerability: Arbitrary strings like `CAR`, `TESTING`, `AAAA1111` are accepted and saved into the database.
- **Phase B Architectural Specification (Section 5.5)**:
  - Create a dedicated validation and normalization module (`src/lib/vehicle-registration.ts`).
  - Support Indian Motor Vehicles Act formats:
    1. **Standard State Series**:
       - 2-letter State/UT code (DL, HR, UP, MH, KA, GJ, RJ, PB, etc.).
       - 1 or 2-digit RTO district code.
       - Optional 1 to 3 series letters.
       - 4-digit registration number (with leading zeros if applicable).
       - Pattern (normalized): `^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`.
    2. **Bharat Series (BH Series)**:
       - 2-digit year of registration (`21`–`29`).
       - `BH` national code.
       - 4-digit registration number (`0001`–`9999`).
       - 1 or 2 letters (`XX`).
       - Pattern (normalized): `^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$`.
  - **Input Normalization**:
    - Auto-uppercase in browser.
    - Allow spaces and hyphens during user typing (e.g. `DL 01 AB 1234` or `HR-26-DQ-5555`).
    - Strip all separators for storage (`DL01AB1234`, `HR26DQ5555`, `22BH1234AA`).
  - **Validation & Messaging**:
    - Client-side inline error message: *"Please enter a valid Indian vehicle registration number (e.g., DL 01 AB 1234 or 22 BH 1234 AA)"* / *"कृपया मान्य वाहन रजिस्ट्रेशन नंबर दर्ज करें (उदा. DL 01 AB 1234 या 22 BH 1234 AA)"*.
    - Server-side validation applied across all entry points: `createHoldSchema`, `admin/manual-bookings.ts`, and `admin/register.ts`.
    - Do NOT scrape or connect to VAHAN (respects privacy invariant).

---

## 3. Staff and Administrative Access Investigation

### 3.1 Existing Admin Infrastructure

The repository already includes the following admin pages:
- `/admin/login/` (`src/pages/admin/login.astro`)
- `/admin/owner/` (`src/pages/admin/owner.astro`)
- `/admin/reception/` (`src/pages/admin/reception.astro`)
- `/admin/register/` (`src/pages/admin/register.astro`)

### 3.2 Navigation and Footer Link Requirement

- Currently, there is NO public link to `/admin/login/` anywhere on the website.
- **Specification**:
  - Add a discreet link in the footer of `BaseLayout.astro`:
    - English: `<a href="/admin/login/">Staff / Admin Login</a>`
    - Hindi: `<a href="/admin/login/">स्टाफ़ / एडमिन लॉगिन</a>`
  - Ensure `/admin/login/` uses `trailingSlash: 'always'` compliance (link to `/admin/reception/` and `/admin/owner/` with trailing slashes).
  - Update `src/pages/admin/login.astro` with bilingual copy, high-contrast typography, and explicit navigation cards for **Owner Console** and **Reception Desk**.

### 3.3 Security & Role Governance

- Administrative pages verify identity via Cloudflare Access JWT assertion (`cf-access-jwt-assertion`).
- The verified email is checked against the active `staff_users` table in D1. Roles (`OWNER`, `RECEPTIONIST`) are strictly enforced server-side.
- Cloudflare Access authenticates the identity; D1 determines the role. Neither layer may be bypassed.

---

## 4. Website Content Pages & Bilingual Content Architecture

### 4.1 Current Content Deficiencies

1. **Pages Affected**: About (`/about/`), Services (`/services/`), How it works (`/how-it-works/`), and Contact (`/contact/`).
2. **Current Implementation**:
   - `src/lib/content.ts` executes: `SELECT title, body FROM localized_content WHERE locale = ? AND page_key = ?`.
   - In `migrations/0001_init.sql`, the 8 seeded records have `body = 'SETUP_REQUIRED'`.
   - `ContentPage.astro` renders a single string:
     ```astro
     <h1>{title}</h1>
     <p>{displayBody}</p>
     ```
   - It cannot render multi-paragraph text, section subheadings (`<h2>`, `<h3>`), or bulleted lists.
   - Injecting raw HTML into `body` would result in escaped text or dangerous XSS vulnerabilities if unescaped.
3. **Missing Owner Content Management**:
   - `src/components/admin/OwnerSettings.tsx` only manages Profile, Vehicle prices, and Operations schedule. It contains NO content management UI.
   - No backend content API exists: `/api/admin/content.ts` is completely missing.

### 4.2 Safe Structured Content Architecture for Phase B

To support rich bilingual content without raw HTML or XSS risks:

- **Data Schema (`localized_content`)**:
  Store content either as structured JSON or sanitized block structures in the existing `body` column:
  ```json
  {
    "intro": "Paragraph text...",
    "sections": [
      {
        "heading": "Section Heading",
        "paragraphs": ["Paragraph 1...", "Paragraph 2..."],
        "listItems": ["Bullet 1", "Bullet 2"]
      }
    ]
  }
  ```
- **Component Renderer (`ContentPage.astro`)**:
  - Detects if `body` is valid JSON or plain text.
  - Safely iterates through structured blocks, rendering semantic `<h2>`, `<p>`, and `<ul><li>` tags.
  - Fallback: Gracefully displays single paragraph for legacy plain-text entries.
- **Owner Content Editor (`OwnerSettings.tsx`)**:
  - Add **04 / WEBSITE CONTENT** tab/section in the Owner Console.
  - Dropdown to select page: About, Services, How it works, Contact.
  - Bilingual side-by-side or tabbed inputs for English and Hindi:
    - Page Title
    - Section Headings
    - Section Content / Bullet lists
  - Real-time preview toggle before saving.
  - API endpoint: `GET /api/admin/content` and `POST /api/admin/content` with role check (`OWNER`), same-origin validation, and audit event logging (`CONTENT_UPDATED`).

### 4.3 Regulatory and Technical Copy Standards

Per mandatory guidelines:
- Official regulatory basis: PESO Gas Cylinders Rules, 2016 and PESO CNG cylinder testing station guidelines.
- Do NOT claim PESO approval, government authorization, or certified status until verified by the owner.
- Mark unverified business details (station address, phone, approval number) as pending owner setup.

---

## 5. File-by-File Phase B Implementation Matrix

| File Path | Nature of Change | Line Numbers / Scope | Key Architectural Role |
|---|---|---|---|
| `src/lib/vehicle-registration.ts` | **NEW FILE** | Complete module (~80 lines) | Centralized Indian state series and BH series validation and normalization |
| `src/lib/schemas.ts` | Modification | Lines 12, 17, +Content schema | Integrate vehicle registration validator; add owner content API schemas |
| `src/lib/i18n.ts` | Modification | Lines 5–42 | Add dictionary entries for linked time dropdowns, registration errors, and footer staff link |
| `src/layouts/BaseLayout.astro` | Modification | Lines 84–90 | Add rich structured footer with bilingual Staff / Admin Login link to `/admin/login/` |
| `src/components/booking/BookingWizard.tsx` | Modification | Lines 107–369 | 1-tap date advance; 1–6 cylinder limits; linked hour/time dropdowns; ₹500 flat advance; registration validation |
| `src/pages/api/public/availability.ts` | Modification | Line 11 | Constrain `cylinderCount` to `min(1).max(6)` for public query |
| `src/pages/api/booking/create-hold.ts` | Modification | Lines 27–45 | Server-side cylinder count <= 6 guard for WEB; enforce registration format; payment gate |
| `src/components/ContentPage.astro` | Modification | Lines 20–51 | Safe structured JSON content renderer with semantic headings, paragraphs, and lists |
| `src/pages/api/admin/content.ts` | **NEW FILE** | Complete API (~90 lines) | Authenticated OWNER GET and POST endpoints for bilingual page content with audit logging |
| `src/components/admin/OwnerSettings.tsx` | Modification | Lines 140–214 | Add Section 04 for Website Content Management; support flat ₹500 advance setting |
| `src/pages/admin/login.astro` | Modification | Lines 13–21 | Polished bilingual design, trailing slash fixes (`/admin/reception/`, `/admin/owner/`) |
| `src/components/admin/ReceptionDashboard.tsx` | Modification | Lines 274, 292 | Apply vehicle registration validation to receptionist manual booking while retaining 1–12 cylinder counts |
| `src/components/admin/RegisterConsole.tsx` | Modification | Line 145 | Apply vehicle registration validation to cylinder register entries |
| `src/pages/api/admin/register.ts` | Modification | Lines 12, 56 | Server-side validation of registration format |
| `src/pages/api/admin/manual-bookings.ts` | Modification | Lines 17, 32 | Server-side validation of registration format |
| `migrations/0002_pricing_and_content.sql` | **NEW MIGRATION** | Complete SQL (~35 lines) | Forward-only migration to ensure ₹500 advance defaults across active vehicle categories |
| `tests/vehicle-registration.test.ts` | **NEW TEST** | Complete suite (~70 lines) | Unit tests for standard state series, BH series, edge cases, and normalization |
| `tests/booking-flow.test.ts` | **NEW TEST** | Complete suite (~100 lines) | Unit tests for 1–6 cylinder bounds, ₹500 flat advance calculation, and linked time filtering |

---

## 6. Conclusion

The application architecture is well-suited for Cloudflare Workers and D1. The identified improvements in the booking wizard, vehicle validation, footer navigation, and owner content management directly fulfill all customer feedback and invariant requirements without requiring framework migrations or architectural disruption.
