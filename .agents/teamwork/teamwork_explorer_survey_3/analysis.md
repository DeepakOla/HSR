# Security and Cloudflare Architecture Survey: HSR Green Energy

**Author**: Agent C — Security and Cloudflare Architect (`teamwork_explorer`)  
**Date**: 2026-11-12  
**Working Directory**: `c:\Users\HP\Downloads\HSR CNG`  
**State Folder**: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_3`  

---

## 1. Executive Summary

This investigation performed a thorough, read-only architectural and security assessment of the HSR Green Energy application, covering Cloudflare Access authentication, staff role authorization, D1 database separation, R2 evidence optionality, Worker configurations, public API endpoints, PII protection, and the design of an owner-only bilingual Content Management API.

### Key Architectural Findings
1. **Cloudflare Access & Staff Role Decoupling**:
   - The application relies on Cloudflare Access for cryptographic identity verification via `cf-access-jwt-assertion` and maps the verified email to the D1 `staff_users` table for application-level role authorization (`OWNER` vs `RECEPTIONIST`).
   - The verification in `src/lib/auth.ts` is strictly fail-closed, using Web Crypto (`RSASSA-PKCS1-v1_5` with `SHA-256`), cached JWKS public certificates from `/cdn-cgi/access/certs`, and rigorous claim checks (`iss`, `aud`, `exp`, `nbf`, `iat`).
   - Browser headers or client-provided roles are never trusted. All administrative endpoints enforce server-side role checks.
2. **The "Power" Identity Provider Display Question**:
   - In Cloudflare Zero Trust, login buttons reflect the friendly display name of the identity provider configured under **Settings > Authentication > Login methods** in the Cloudflare Zero Trust Dashboard.
   - If the Cloudflare account hosts other projects (e.g., an enterprise tenant or organization named "Power") or an IdP labeled "Power" (such as a Google/OIDC integration), users see "Power" on the login screen.
   - Because `verifyAccessJwt` cryptographically asserts `payload.aud === ACCESS_AUDIENCE` and `payload.iss === https://${ACCESS_TEAM_DOMAIN}`, and requires the user's email to exist in the HSR D1 `staff_users` table, an authentication prompt showing "Power" does not bypass security. However, the exact Access Application and allowed IdP association must be verified before production.
3. **D1 Database Isolation & Preview-Only Provisioning**:
   - Production (`hsr_green_energy_prod`: `2167157a-4c00-4063-b183-c0a5bd12ed5d`) and Preview (`hsr_green_energy_preview`: `3220c6e5-64ff-4874-9d5d-0e237f5af9ad`) databases are strictly segregated in `wrangler.jsonc` and `wrangler.preview-migrations.jsonc`.
   - The safe, non-destructive Preview-only provisioning command for the first owner record has been formulated and documented.
4. **R2 Optionality & Preview Resilience**:
   - `hsr-prod` is bound exclusively in the production environment. Previews have no `r2_buckets` binding, ensuring Preview tests never access or mutate production payment evidence.
   - Code-level checks in `create-hold.ts`, `upload-evidence.ts`, and `admin/evidence.ts` gracefully detect `!env.EVIDENCE_BUCKET` and return localized user guidance or HTTP 503 without unhandled exceptions or Worker crashes.
5. **Public API Security & Anti-Tampering Gaps**:
   - **Cylinder Count Tampering**: The public API `/api/booking/create-hold` currently allows holds for up to 12 cylinders if a client supplies a valid `categoryId`. It must enforce `cylinderCount <= 6` on the server for `source: 'WEB'`.
   - **Payment Gate Bypass**: `createHold` writes to D1 before verifying whether merchant UPI credentials (`vpa_id`, `vpa_payee_name`) are configured, creating orphaned unpaid holds when payment settings are incomplete.
   - **Vehicle Registration Normalization**: Current normalization preserves hyphens and accepts arbitrary strings. Strict Indian State-series and Bharat-series (BH) regex validation is required across public booking, reception, and cylinder register workflows.
6. **Owner-Only Content CMS Architecture**:
   - Designed a secure, owner-authenticated API (`/api/admin/content`) with same-origin protection, audit logging, and a structured JSON block schema (headings, paragraphs, bullet lists).
   - This eliminates raw HTML rendering and prevents Cross-Site Scripting (XSS) while enabling full bilingual editing for About, Services, How It Works, and Contact pages.

---

## 2. Cloudflare Access & Staff/Admin Authentication

### 2.1 Access JWT Verification Architecture (`src/lib/auth.ts`)
The server-side verification logic operates as follows:

```
[Incoming Request]
       │
       ▼
[Header Extraction] cf-access-jwt-assertion
       │
       ├─► Missing or contains 'SETUP_REQUIRED'? ──► Reject (null / 401)
       │
       ▼
[JWT Structure Check] 3 Base64URL parts, alg = RS256, kid present
       │
       ▼
[Claim Assertions]
       ├─► iss === 'https://' + env.ACCESS_TEAM_DOMAIN
       ├─► aud includes env.ACCESS_AUDIENCE
       ├─► exp > current_time (Unix epoch seconds)
       ├─► nbf <= current_time
       └─► iat <= current_time + 60s (clock skew tolerance)
       │
       ▼
[Public Key Retrieval & Caching]
       ├─► Fetch keys from https://${domain}/cdn-cgi/access/certs
       └─► In-memory cache with 5-minute TTL (`cachedKeys`)
       │
       ▼
[Cryptographic Signature Verification]
       ├─► Web Crypto: crypto.subtle.importKey('jwk', key, RSASSA-PKCS1-v1_5, SHA-256)
       └─► crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, data)
       │
       ▼
[Verified Email Extraction]
       └─► Returns payload.email.trim().toLowerCase()
```

#### Code Implementation Analysis
In `src/lib/auth.ts`:
- **Fail-Closed Gate**:
  ```typescript
  const configuredDomain = (env.ACCESS_TEAM_DOMAIN ?? '').trim().replace('https://', '').replace('http://', '').replace(/\/+$/, '');
  const audience = env.ACCESS_AUDIENCE?.trim();
  const token = request.headers.get('cf-access-jwt-assertion');

  if (!configuredDomain || !audience || configuredDomain.includes('SETUP_REQUIRED') || audience === 'SETUP_REQUIRED' || !token) {
    return null;
  }
  ```
  If either `ACCESS_TEAM_DOMAIN` or `ACCESS_AUDIENCE` is unconfigured or set to `SETUP_REQUIRED`, all verification immediately fails closed.
- **Key Caching**: The public keys are fetched from the Access certs endpoint and cached for 5 minutes (`Date.now() + 5 * 60_000`). This avoids per-request network hops to Cloudflare's JWKS endpoint while maintaining cryptographic freshness.

### 2.2 Role Mapping via D1 `staff_users`
Once the JWT signature and claims are verified, the email is queried against the D1 database:

```typescript
export async function getStaffContext(request: Request, env: Env): Promise<StaffContext | null> {
  const email = await verifyAccessJwt(request, env);
  if (!email) return null;

  try {
    const staff = await env.DB.prepare(
      'SELECT role FROM staff_users WHERE lower(email) = ? AND is_active = 1'
    ).bind(email).first<{ role: StaffRole }>();

    if (!staff || (staff.role !== 'OWNER' && staff.role !== 'RECEPTIONIST')) return null;
    return { email, role: staff.role };
  } catch {
    return null;
  }
}
```

#### Security Properties:
1. **Zero Browser Trust**: The client cannot send custom role headers (e.g. `X-User-Role: OWNER`). Any such header is completely ignored.
2. **Database Authorization**: Cloudflare Access proves *who* the user is (identity); D1 `staff_users` determines *what* they can do (authorization).
3. **Active Flag Defense**: Even if an email has a valid Cloudflare Access token, if `is_active` is `0`, access is denied.

### 2.3 The "Power" Identity Provider Investigation
In Section 5.6 of the brief, the following issue was raised:
> "Confirm which login identity provider is configured and why the provider/display name appears as 'Power'. Determine whether this is merely the identity-provider display name or an incorrect application/policy association."

#### Architectural Analysis:
1. **Cloudflare Zero Trust IdP Display Model**:
   - Under **Cloudflare Zero Trust > Settings > Authentication > Login methods**, administrators define Identity Providers (Google Workspace, Microsoft Entra ID, GitHub, Okta, SAML/OIDC, or One-Time PIN).
   - Each provider has a user-defined **Name** field. This name is displayed directly on the Cloudflare Access login modal as the button text (e.g., "Sign in with Power" or "Power").
   - If the Cloudflare account has other projects (such as an organization or system named "Power"), the IdP created in that account was named "Power".
2. **Application Association vs. IdP Display Name**:
   - When an Access Application is created for HSR (e.g., protecting `hsr-preview...` or `/admin*`), the administrator selects which login methods are permitted under **Application > Authentication**.
   - If "Accept all identity providers" was toggled on, or if the "Power" IdP was explicitly checked, the Access login screen will display the "Power" button.
   - **Risk Assessment**:
     - *Scenario A (Merely IdP Display Name)*: The Access application correctly protects the HSR Preview hostname with policies restricted to HSR emails, but the IdP configured in the Cloudflare account was named "Power". When the owner clicks "Power", they authenticate with their Google/corporate email. Once authenticated, Access issues a JWT with the HSR Access application AUD tag. The HSR Worker validates the AUD and matches the email against `staff_users`. **No security risk exists in this scenario.**
     - *Scenario B (Incorrect Application / Hostname Policy)*: The HSR Preview hostname was added under an existing "Power" application instead of an isolated "HSR Green Energy" application. In this scenario, the AUD tag issued would belong to "Power", and policies defined for "Power" would govern access to HSR.
3. **Verification & Guardrails**:
   - `src/lib/auth.ts` validates `payload.aud === env.ACCESS_AUDIENCE`. If the Worker is configured with HSR's AUD tag, any token issued by a different application will fail verification.
   - Even if an external identity bypasses Access, they are rejected with 401/403 because their email does not exist in `staff_users`.
   - **Directive**: Do NOT delete, rename, or alter any "Power" identity provider or policy without owner authorization, as it may break authentication for other systems in the same Cloudflare account.

### 2.4 First Owner Safe Provisioning (Preview-Only)
If the Preview database lacks an active owner record, it must be provisioned securely using the exact email returned by the verified Access JWT.

#### Exact Preview-Only Command:
```powershell
npx wrangler d1 execute hsr_green_energy_preview --remote --command "INSERT INTO staff_users (email, role, is_active) VALUES ('OWNER_EMAIL_FROM_ACCESS', 'OWNER', 1) ON CONFLICT(email) DO UPDATE SET role = 'OWNER', is_active = 1;"
```
Or via the preview migrations configuration:
```powershell
npx wrangler d1 execute PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc --command "INSERT INTO staff_users (email, role, is_active) VALUES ('OWNER_EMAIL_FROM_ACCESS', 'OWNER', 1) ON CONFLICT(email) DO UPDATE SET role = 'OWNER', is_active = 1;"
```

#### Production Command (Merge/Release Only):
```powershell
npx wrangler d1 execute hsr_green_energy_prod --remote --command "INSERT INTO staff_users (email, role, is_active) VALUES ('OWNER_EMAIL_FROM_ACCESS', 'OWNER', 1) ON CONFLICT(email) DO UPDATE SET role = 'OWNER', is_active = 1;"
```

#### Invariants:
- Never accept an owner role from a public form, query parameter, or client header.
- The email address must be normalized to lowercase and trimmed before storage.

### 2.5 Route Protection Audit
We conducted a complete line-by-line inspection of all admin pages and APIs:

| Path | File | Allowed Roles | Protection Mechanism | Same-Origin Check |
|---|---|---|---|---|
| `/admin/login` | `src/pages/admin/login.astro` | Public info | Informational page explaining Access | N/A (Static GET) |
| `/admin/owner` | `src/pages/admin/owner.astro` | `OWNER` | `requireRole(Astro.request, env, ['OWNER'])` | N/A (SSR Page) |
| `/admin/settings` | `src/pages/admin/settings.astro` | `OWNER` | `requireRole(Astro.request, env, ['OWNER'])` | N/A (SSR Page) |
| `/admin/reception` | `src/pages/admin/reception.astro` | `OWNER`, `RECEPTIONIST` | `requireRole(Astro.request, env, ['OWNER', 'RECEPTIONIST'])` | N/A (SSR Page) |
| `/admin/register` | `src/pages/admin/register.astro` | `OWNER`, `RECEPTIONIST` | `requireRole(Astro.request, env, ['OWNER', 'RECEPTIONIST'])` | N/A (SSR Page) |
| `/admin/reports` | `src/pages/admin/reports.astro` | `OWNER`, `RECEPTIONIST` | `requireRole(Astro.request, env, ['OWNER', 'RECEPTIONIST'])` | N/A (SSR Page) |
| `/api/admin/settings` | `src/pages/api/admin/settings.ts` | `OWNER` | `requireRole(request, env, ['OWNER'])` | `validateOrigin(request)` on POST |
| `/api/admin/categories` | `src/pages/api/admin/categories.ts` | `OWNER` | `requireRole(request, env, ['OWNER'])` | `validateOrigin(request)` on POST |
| `/api/admin/schedule` | `src/pages/api/admin/schedule.ts` | `OWNER` | `requireRole(request, env, ['OWNER'])` | `validateOrigin(request)` on POST |
| `/api/admin/bookings` | `src/pages/api/admin/bookings.ts` | `OWNER`, `RECEPTIONIST` | `requireRole(request, env, ['OWNER', 'RECEPTIONIST'])` | `validateOrigin(request)` on POST |
| `/api/admin/manual-bookings` | `src/pages/api/admin/manual-bookings.ts` | `OWNER`, `RECEPTIONIST` | `requireRole(request, env, ['OWNER', 'RECEPTIONIST'])` | `validateOrigin(request)` on POST |
| `/api/admin/dashboard` | `src/pages/api/admin/dashboard.ts` | `OWNER`, `RECEPTIONIST` | `requireRole(request, env, ['OWNER', 'RECEPTIONIST'])` | N/A (GET) |
| `/api/admin/availability` | `src/pages/api/admin/availability.ts` | `OWNER`, `RECEPTIONIST` | `requireRole(request, env, ['OWNER', 'RECEPTIONIST'])` | N/A (GET) |
| `/api/admin/evidence` | `src/pages/api/admin/evidence.ts` | `OWNER`, `RECEPTIONIST` | `requireRole(request, env, ['OWNER', 'RECEPTIONIST'])` | Private object fetch |
| `/api/admin/register` | `src/pages/api/admin/register.ts` | `OWNER`, `RECEPTIONIST` | `requireRole(request, env, ['OWNER', 'RECEPTIONIST'])` | `validateOrigin(request)` on POST |
| `/api/admin/exports/bookings.csv` | `src/pages/api/admin/exports/bookings.csv.ts` | `OWNER`, `RECEPTIONIST` | `requireRole(request, env, ['OWNER', 'RECEPTIONIST'])` | `private, no-store` header |

#### Finding on Website Footer:
The public layout (`src/layouts/BaseLayout.astro`) currently lacks a footer link to `/admin/login/`. A discreet "Staff / Admin Login" / "स्टाफ़ / एडमिन लॉगिन" link must be added to the footer in English and Hindi.

---

## 3. Cloudflare D1 and R2 Configuration

### 3.1 D1 Database Separation & Migration Architecture
- **Production Database**:
  - Name: `hsr_green_energy_prod`
  - ID: `2167157a-4c00-4063-b183-c0a5bd12ed5d`
  - Binding: `env.DB`
  - Applied via: `npm run db:migrate:remote` (`npx wrangler d1 migrations apply hsr_green_energy_prod --remote`)
- **Preview Database**:
  - Name: `hsr_green_energy_preview`
  - ID: `3220c6e5-64ff-4874-9d5d-0e237f5af9ad`
  - Binding in `wrangler.jsonc` (under `previews.d1_databases`): `env.DB`
  - Config file for migrations: `wrangler.preview-migrations.jsonc` (`binding: "PREVIEW_DB"`)
  - Applied via: `npm run db:migrate:preview` (`npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc`)

#### Observability Gap Flagged:
In `wrangler.jsonc`, `observability.enabled` is `true`, but `observability.traces.enabled` is omitted. As highlighted in `workers-best-practices`, top-level `enabled: true` alone does not enable distributed tracing. `observability.traces.enabled = true` should be added when updating Worker configuration.

### 3.2 R2 Evidence Bucket Optionality
- **Production Bucket**: `hsr-prod` bound as `EVIDENCE_BUCKET` in top-level `wrangler.jsonc`.
- **Preview Isolation**: In `wrangler.jsonc`, the `previews` block contains `d1_databases` and `vars`, but intentionally **omits** `r2_buckets`.
- **Runtime Handling of Missing R2 Binding**:
  1. `src/pages/api/booking/create-hold.ts`:
     ```typescript
     uploadEnabled: result.paymentConfig.r2Enabled && !!env.EVIDENCE_BUCKET,
     uploadUnavailableReason: result.paymentConfig.r2Enabled && env.EVIDENCE_BUCKET
       ? null
       : parsed.data.locale === 'en'
         ? 'Website screenshot upload is not configured. Use the full UTR/reference number or WhatsApp fallback.'
         : 'वेबसाइट स्क्रीनशॉट अपलोड कॉन्फ़िगर नहीं है। पूरा UTR/रेफरेंस नंबर या WhatsApp विकल्प उपयोग करें।',
     ```
     When `env.EVIDENCE_BUCKET` is undefined, `uploadEnabled` is set to `false`, and the localized message informs the customer to submit UTR or use WhatsApp.
  2. `src/pages/api/booking/upload-evidence.ts`:
     ```typescript
     if (!env.EVIDENCE_BUCKET) {
       return errorResponse('Website screenshot upload is unavailable. Use full UTR and WhatsApp fallback.', 503, 'R2_UNAVAILABLE');
     }
     ```
     Returns HTTP 503 cleanly.
  3. `src/pages/api/admin/evidence.ts`:
     ```typescript
     const bucket = getRuntimeEnv(locals).EVIDENCE_BUCKET;
     if (!bucket) return errorResponse('R2 bucket not configured', 503);
     ```
     Returns HTTP 503 cleanly when receptionist views evidence.
  4. `business_settings.r2_enabled`: Defaults to `0` in D1 schema.

#### Byte Type Bug Identified in `upload-evidence.ts`:
In `src/pages/api/booking/upload-evidence.ts` line 106:
`await crypto.subtle.digest('SHA-256', bytes)` returns an `ArrayBuffer`. When bound to D1 `payment_evidence.sha256 TEXT`, it should be hex-encoded as a string (using `Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')`) to prevent type mismatches.

---

## 4. API Security, PII Protection & Content CMS API Design

### 4.1 Audit of Public Endpoints

#### 1. `POST /api/booking/create-hold`
- **Rate Limit**: 20 requests / 60 seconds per IP.
- **Origin Check**: Enforced via `validateOrigin(request)`.
- **Idempotency**: Handled via `idempotency_keys` table using `idempotencyKey` UUID.
- **PII Leakage**: None. Returns tokens and booking summary only to the creating client.
- **Security Defect 1 (Public Cylinder Tampering)**:
  - `createHoldSchema` in `src/lib/schemas.ts` accepts any valid `categoryId: z.number().int().positive()`.
  - If a user sends the `id` of `CYL_10` (10 cylinders) directly via curl or modified JS, `createHold` creates the hold and allocates 10 work units even though `source === 'WEB'`.
  - **Fix**: Enforce `categoryRow.cylinderCount <= 6` on server when `source === 'WEB'`, returning 400 Bad Request if exceeded.
- **Security Defect 2 (Payment Gate Bypass)**:
  - `createHold` creates DB holds before verifying whether merchant UPI VPA/payee name are configured.
  - **Fix**: Check `settings.vpa_id` and `settings.vpa_payee_name` before executing the D1 transaction. If unconfigured or `SETUP_REQUIRED`, reject the hold with 422 `PAYMENT_INSTRUCTIONS_UNAVAILABLE` and direct to phone/WhatsApp.

#### 2. `GET /api/public/availability`
- **PII Leakage**: Zero. Queries `daily_slot_snapshots` and returns slot counts and boolean availability (`canStartBooking`, `reserved`). No customer names, phones, or vehicle numbers are returned.
- **Tampering Gap**: `cylinderCount` validation accepts up to 20 (`z.coerce.number().min(1).max(20)`). Should be constrained to `max(6)` for public availability.

#### 3. `GET /api/public/vehicle-categories`
- **PII Leakage**: Zero.
- **Scope Gap**: Currently returns all active categories (1 to 12). Should filter `cylinder_count <= 6` for public consumption, while `/api/admin/categories` provides all 12 to staff.

#### 4. `POST /api/booking/submit-evidence` & `upload-evidence`
- **Rate Limit**: 30 requests / 60 seconds per IP (`submit-evidence`), 10 requests / 60 seconds (`upload-evidence`).
- **Authorization**: Requires high-entropy `statusToken` (24 bytes, 192 bits). Matches `sha256(statusToken)`.
- **PII Leakage**: Zero.
- **Guardrail**: Rejects submission if hold has expired (`hold_expires_at > now`).

#### 5. `GET /api/status/[bookingCode]`
- **Authorization**: Requires `bookingCode` and `token` query param. Verifies `status_token_hash = sha256(token)`.
- **PII Leakage**: Evaluated. Returns `bookingCode`, `reservationState`, `paymentState`, `serviceDate`, `slotLabel`, `cylinderCount`. Customer name and phone are strictly omitted.
- **Gap**: Missing rate limiting. Add `checkRateLimit(limitKey(request, 'booking-status'), 30, 60_000)`.

### 4.2 Indian Vehicle Registration Validation
Current `normalizeVehicleRegistration` in `src/lib/utils.ts` retains hyphens and permits arbitrary text.
We establish the following standard Indian vehicle registration validation architecture:

```typescript
export const STATE_SERIES_REGEX = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/;
export const BH_SERIES_REGEX = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

export function normalizeVehicleRegistration(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidVehicleRegistration(value: string): boolean {
  const normalized = normalizeVehicleRegistration(value);
  return STATE_SERIES_REGEX.test(normalized) || BH_SERIES_REGEX.test(normalized);
}
```

- **State Series Matches**: `DL01AB1234`, `HR26DQ5555`, `MH121234`, `UP16Z9999`, `KA05M9`, `DL1C1234`.
- **Bharat Series Matches**: `22BH1234AA`, `21BH9999A`, `24BH0001Z`.
- **Enforcement**: Applied in `createHoldSchema`, `src/lib/booking-engine.ts`, `manual-bookings.ts`, and `register.ts`.

---

## 5. Owner-Only Bilingual Content Management API Design

### 5.1 Content Security & Zero-XSS Architecture
Section 5.7 and 5.8 require an owner-facing content management system for:
1. About HSR Green Energy
2. Services
3. How the testing and booking process works
4. Contact

**Core Architectural Rule**: Never store or render raw untrusted HTML. Avoid `dangerouslySetInnerHTML` or unconstrained markdown renderers.
Instead, we design a **Structured Block Content Model**:

```typescript
export type ContentBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

export interface PageContentDocument {
  pageKey: 'about' | 'services' | 'how-it-works' | 'contact';
  en: { title: string; blocks: ContentBlock[] };
  hi: { title: string; blocks: ContentBlock[] };
}
```

#### Why Structured Blocks Ensure Maximum Security:
1. **Zero XSS Risk**: Text values are plain strings. Rendered via native Astro/React JSX tags (`<h2>{block.text}</h2>`, `<p>{block.text}</p>`, `<li>{item}</li>`). JSX automatically HTML-encodes all text, neutralizing `<script>`, `<iframe>`, `onload`, or tag injection.
2. **Deterministic Layout**: Blocks naturally support headings, paragraphs, and bullet lists without complex client-side markdown parsers.
3. **Backwards Compatibility**: If `body` in `localized_content` is `'SETUP_REQUIRED'` or legacy plain text, the renderer safely treats it as a single paragraph.

### 5.2 API Specifications (`/api/admin/content`)

#### Endpoint 1: `GET /api/admin/content`
- **Role**: `OWNER` only (`requireRole(request, env, ['OWNER'])`).
- **Response**:
  ```json
  {
    "data": {
      "pages": {
        "about": {
          "en": { "title": "...", "blocks": [...] },
          "hi": { "title": "...", "blocks": [...] }
        },
        "services": { ... },
        "how-it-works": { ... },
        "contact": { ... }
      }
    }
  }
  ```

#### Endpoint 2: `POST /api/admin/content`
- **Role**: `OWNER` only.
- **Protection**:
  - `requireRole(request, env, ['OWNER'])`
  - `validateOrigin(request)` (same-origin enforcement)
  - Zod validation schema:
    ```typescript
    const contentBlockSchema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('heading'), text: z.string().trim().min(1).max(200) }),
      z.object({ type: z.literal('paragraph'), text: z.string().trim().min(1).max(2000) }),
      z.object({ type: z.literal('list'), items: z.array(z.string().trim().min(1).max(500)).min(1).max(20) }),
    ]);

    const saveContentSchema = z.object({
      pageKey: z.enum(['about', 'services', 'how-it-works', 'contact']),
      en: z.object({
        title: z.string().trim().min(2).max(150),
        blocks: z.array(contentBlockSchema).min(1).max(30),
      }),
      hi: z.object({
        title: z.string().trim().min(2).max(150),
        blocks: z.array(contentBlockSchema).min(1).max(30),
      }),
    }).strict();
    ```
- **Database Write & Audit Logging**:
  Atomic execution via `db.batch([ ... ])`:
  1. Upsert `localized_content` for `locale = 'en'`:
     `body = JSON.stringify(en.blocks)`
  2. Upsert `localized_content` for `locale = 'hi'`:
     `body = JSON.stringify(hi.blocks)`
  3. Insert into `booking_audit_events`:
     `event_type = 'CONTENT_UPDATED'`, `actor_type = 'STAFF'`, `actor_id = auth.staff.email`, with payload `{ pageKey, enBlocksCount, hiBlocksCount }`.

---

## 6. Implementation Plan & Files to Modify in Phase B

### 6.1 Database Schema & Migration Changes
- **New Forward Migration**: `migrations/0006_advance_pricing.sql`
  1. Seed default flat advance of ₹500 (`advance_paise = 50000`) for categories `CYL_01` to `CYL_06` where `advance_paise IS NULL`.
  2. Normalize legacy vehicle registrations in `vehicles` table to strip hyphens.
  3. Recreate `bookings_capacity_guard` trigger to abort with `PUBLIC_CYLINDER_LIMIT_EXCEEDED` if `NEW.source = 'WEB' AND NEW.cylinder_count_snapshot > 6`.

### 6.2 Application Code Modifications

| Category | File | Specific Action |
|---|---|---|
| **Auth & Security** | `src/lib/utils.ts` | Strip hyphens in `normalizeVehicleRegistration`; add `isValidVehicleRegistration`. |
| **Auth & Security** | `src/lib/schemas.ts` | Enforce `isValidVehicleRegistration` in `createHoldSchema`. |
| **Booking & Gating** | `src/lib/booking-engine.ts` | Enforce payment gate (reject hold if VPA/payee unconfigured); enforce `cylinderCount <= 6` for WEB bookings. |
| **Public API** | `src/pages/api/booking/create-hold.ts` | Pre-check payment readiness before invoking `createHold`; return clear WhatsApp/phone fallback. |
| **Public API** | `src/pages/api/public/availability.ts` | Restrict `cylinderCount` query schema parameter to `min(1).max(6)`. |
| **Public API** | `src/pages/api/public/vehicle-categories.ts` | Filter to return only active categories where `cylinder_count <= 6`. |
| **Public API** | `src/pages/api/status/[bookingCode].ts` | Add rate limiting (`checkRateLimit`); add snapshot price, GST, advance, and balance fields to response. |
| **Public API** | `src/pages/api/booking/upload-evidence.ts` | Ensure SHA-256 digest is hex-encoded before inserting into `payment_evidence`. |
| **Admin API** | `src/pages/api/admin/content.ts` | **New API endpoint**: GET and POST handlers for owner-only structured page content management. |
| **Admin API** | `src/pages/api/admin/categories.ts` | Permit `RECEPTIONIST` role on GET so receptionist dashboard can access all 1–12 cylinder categories. |
| **UI Components** | `src/layouts/BaseLayout.astro` | Add discreet "Staff / Admin Login" link in footer in English and Hindi. |
| **UI Components** | `src/components/ContentPage.astro` | Render structured block documents safely (headings, paragraphs, lists) with fallback to plain text. |
| **UI Components** | `src/components/admin/OwnerSettings.tsx` | Add bilingual Page Content Editor tab/section calling `/api/admin/content`. |
| **Worker Config** | `wrangler.jsonc` | Add `observability.traces.enabled = true` under `observability`. |
| **Tests** | `tests/security-auth-content.test.ts` | **New test suite**: Verify Access JWT checks, role mapping, owner content API validation, same-origin rejection, payment gate rejection, and cylinder tampering prevention. |

---

## 7. Conclusion

The security architecture of HSR Green Energy demonstrates strong fundamental isolation between identity (Cloudflare Access) and authorization (D1 roles), with robust fail-closed mechanics and isolated Preview databases.

By addressing the identified public cylinder count tampering vulnerability, implementing strict UPI payment gating prior to hold creation, fixing vehicle registration normalization to conform to Indian standards, adding the discreet staff footer login link, and deploying the structured-content owner CMS API, the platform will satisfy all production security, privacy, and regulatory invariants.
