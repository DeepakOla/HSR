# Handoff Report: Security and Cloudflare Architecture Survey

**Author**: Agent C — Security and Cloudflare Architect (`teamwork_explorer`)  
**Date**: 2026-11-12  
**Working Directory**: `c:\Users\HP\Downloads\HSR CNG`  
**State Folder**: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_3`  
**Milestone**: Survey Phase Completed  

---

## 1. Observation

1. **Cloudflare Access & JWT Verification**:
   - `src/lib/auth.ts` lines 64–73:
     ```typescript
     const configuredDomain = (env.ACCESS_TEAM_DOMAIN ?? '').trim().replace('https://', '').replace('http://', '').replace(/\/+$/, '');
     const audience = env.ACCESS_AUDIENCE?.trim();
     const token = request.headers.get('cf-access-jwt-assertion');

     if (!configuredDomain || !audience || configuredDomain.includes('SETUP_REQUIRED') || audience === 'SETUP_REQUIRED' || !token) {
       return null;
     }
     ```
   - `src/lib/auth.ts` lines 82–87:
     ```typescript
     const issuer = `https://${configuredDomain}`;
     if (payload.iss !== issuer) return null;

     const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
     if (!audiences.includes(audience)) return null;
     ```
   - In `wrangler.jsonc` lines 40–41 and 55–56:
     ```json
     "ACCESS_AUDIENCE": "SETUP_REQUIRED",
     "ACCESS_TEAM_DOMAIN": "SETUP_REQUIRED.cloudflareaccess.com"
     ```
   - `src/lib/auth.ts` lines 125–130:
     ```typescript
     const staff = await env.DB.prepare(
       'SELECT role FROM staff_users WHERE lower(email) = ? AND is_active = 1'
     ).bind(email).first<{ role: StaffRole }>();
     if (!staff || (staff.role !== 'OWNER' && staff.role !== 'RECEPTIONIST')) return null;
     ```

2. **Server-Side Route Protection**:
   - Every administrative page route (`src/pages/admin/owner.astro:7`, `reception.astro:7`, `settings.astro:5`, `register.astro:7`, `reports.astro:5`) executes `await requireRole(Astro.request, getRuntimeEnv(Astro.locals), [...])` before rendering any HTML.
   - Every administrative API endpoint (`src/pages/api/admin/settings.ts:29,36`, `categories.ts:34,48`, `schedule.ts:44,87`, `bookings.ts:10,56`, `manual-bookings.ts:24`, `dashboard.ts:16`, `availability.ts:17`, `evidence.ts:8`, `register.ts:26`, `exports/bookings.csv.ts:7`) calls `requireRole(...)`.
   - All state-changing POST endpoints (`settings.ts:39`, `categories.ts:51`, `schedule.ts:90`, `bookings.ts:59`, `manual-bookings.ts:27`, `register.ts:29`) enforce `validateOrigin(request)`.

3. **Public Navigation / Footer Missing Admin Link**:
   - In `src/layouts/BaseLayout.astro` lines 84–89:
     ```astro
     <footer>
       <div class="container section">
         <p>{businessName}</p>
         <p>{locale === 'en' ? 'Owner-managed details may be marked SETUP_REQUIRED until configured.' : 'मालिक कॉन्फ़िगरेशन तक कुछ जानकारी SETUP_REQUIRED दिख सकती है।'}</p>
       </div>
     </footer>
     ```
     There is no link to `/admin/login/`.

4. **D1 & R2 Resource Isolation**:
   - `wrangler.jsonc` lines 18–25 vs 44–52:
     - Top-level database ID: `2167157a-4c00-4063-b183-c0a5bd12ed5d` (`hsr_green_energy_prod`).
     - Preview database ID: `3220c6e5-64ff-4874-9d5d-0e237f5af9ad` (`hsr_green_energy_preview`).
   - `wrangler.preview-migrations.jsonc` defines `binding: "PREVIEW_DB"` for Preview migrations.
   - `wrangler.jsonc` lines 26–31: `r2_buckets` binds `hsr-prod` in production. The `previews` block (lines 44–59) contains no `r2_buckets` binding.
   - In `src/pages/api/booking/upload-evidence.ts` lines 29–31:
     ```typescript
     if (!env.EVIDENCE_BUCKET) {
       return errorResponse('Website screenshot upload is unavailable. Use full UTR and WhatsApp fallback.', 503, 'R2_UNAVAILABLE');
     }
     ```
   - In `src/pages/api/admin/evidence.ts` lines 29–31:
     ```typescript
     const bucket = getRuntimeEnv(locals).EVIDENCE_BUCKET;
     if (!bucket) return errorResponse('R2 bucket not configured', 503);
     ```

5. **Public API Security Vulnerabilities**:
   - In `src/lib/schemas.ts` lines 5–15:
     ```typescript
     export const createHoldSchema = z.object({
       locale: localeSchema,
       slotSnapshotId: z.number().int().positive(),
       categoryId: z.number().int().positive(),
       ...
     ```
     There is no constraint on `categoryId` ensuring `cylinderCount <= 6`.
   - In `src/pages/api/booking/create-hold.ts` lines 33–44:
     ```typescript
     const result = await createHold(db, { ...parsed.data, source: 'WEB' });
     let upiUri: string | null = null;
     if (
       result.paymentConfig.vpaId !== 'SETUP_REQUIRED' &&
       result.paymentConfig.payeeName !== 'SETUP_REQUIRED' && ...
     ```
     `createHold` is invoked and writes to D1 before checking if `vpaId` or `payeeName` are configured.
   - In `src/lib/utils.ts` line 28:
     ```typescript
     export function normalizeVehicleRegistration(value: string): string {
       return value.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
     }
     ```
     Hyphens are retained and arbitrary strings of 4–20 characters pass validation.
   - In `src/pages/api/status/[bookingCode].ts`:
     No rate limiting is applied to requests.

6. **Missing Content CMS API**:
   - `src/pages/en/about.astro:11`, `services.astro`, `how-it-works.astro`, `contact.astro` query `localized_content`.
   - The database contains `SETUP_REQUIRED` text (`migrations/0001_init.sql:278-287`).
   - No file exists at `src/pages/api/admin/content.ts` and `OwnerSettings.tsx` has no page content editor.

---

## 2. Logic Chain

1. **Authentication Integrity**:
   - From Observation 1, because `verifyAccessJwt` asserts `payload.iss`, `payload.aud`, and signature against Cloudflare's JWKS endpoint, forged JWTs cannot pass.
   - Because `getStaffContext` queries `staff_users` using the cryptographically verified email, role headers cannot be spoofed.
   - The "Power" login button observed by the user represents the display name of the identity provider configured at the Cloudflare Zero Trust account level. Even if an external user authenticates via "Power", their JWT will fail if the audience does not match `ACCESS_AUDIENCE`, or they will receive a 401/403 response because their email is not present in D1 `staff_users`.

2. **Server-Side Protection Verification**:
   - From Observation 2, every administrative page and API route checks authorization server-side using `requireRole`.
   - State-changing APIs enforce origin checks (`validateOrigin`), preventing cross-site request forgery.
   - From Observation 3, the public layout lacks a navigation path to `/admin/login/`, which must be resolved for staff discoverability.

3. **D1 and R2 Segregation & Preview Resilience**:
   - From Observation 4, Preview and Production databases have distinct IDs. Migrations to Preview are isolated via `wrangler.preview-migrations.jsonc`.
   - The production R2 bucket is deliberately unbound in Previews. When `env.EVIDENCE_BUCKET` is undefined, `create-hold.ts`, `upload-evidence.ts`, and `admin/evidence.ts` return informative 503/fallback responses without throwing unhandled exceptions.

4. **Public Endpoint Anti-Tampering & Payment Gating**:
   - From Observation 5, a user can currently bypass the frontend UI and submit `categoryId` for >6 cylinders via `POST /api/booking/create-hold`. Server-side validation must restrict public bookings to `cylinderCount <= 6`.
   - `createHold` writes to D1 before validating merchant UPI credentials. When VPA/payee details are missing, holds are created without payment instructions, locking capacity. A pre-flight payment gate must reject holds when payment instructions are unusable.
   - Vehicle registration validation retains hyphens and permits malformed strings, risking duplicate rows. Indian State-series and Bharat-series (BH) regex patterns must be strictly enforced.

5. **Safe Content CMS Architecture**:
   - From Observation 6, page content cannot currently be edited by the owner.
   - Storing and rendering raw HTML introduces XSS risks. A structured JSON block model (heading, paragraph, list) guarantees complete XSS immunity while fulfilling the owner's bilingual editing requirements.

---

## 3. Caveats

1. **Cloudflare Zero Trust Remote Dashboard Access**: As a read-only agent without direct Cloudflare dashboard or API credentials, I verified the local configuration files (`wrangler.jsonc`, `wrangler.preview-migrations.jsonc`, `src/lib/auth.ts`). The exact display label of the IdP in the Cloudflare Zero Trust dashboard should be confirmed by the owner before final production cutover.
2. **Preview R2 Test Bucket**: Previews currently have no R2 bucket. If the team decides to test screenshot uploads in Previews, a separate test bucket (e.g. `hsr-preview-evidence`) must be created and bound under `previews.r2_buckets` in `wrangler.jsonc`; the production bucket must never be shared with Previews.
3. **No Code Modified**: In accordance with the Explorer role constraints, no application files or migrations were modified during this investigation.

---

## 4. Conclusion

1. The authentication and authorization layers are structurally sound, fail-closed, and strictly enforce role segregation (`OWNER` vs `RECEPTIONIST`) via server-side checks and D1 lookups.
2. The "Power" login label is an account-level Cloudflare Zero Trust IdP display name. The cryptographic audience validation in `src/lib/auth.ts` prevents unauthorized cross-application access.
3. Three critical security/business logic fixes are required before Phase C testing:
   - Enforce public cylinder limits (`<= 6`) on the server in `/api/booking/create-hold`.
   - Implement pre-write payment gating in `createHold` to prevent unpayable holds when UPI VPA/payee are unconfigured.
   - Enforce Indian vehicle registration validation (State and BH series) and hyphen-stripping normalization.
4. An owner-only Content CMS API (`/api/admin/content`) using structured JSON blocks must be implemented to allow safe, XSS-free bilingual page updates with audit logging.
5. A discreet "Staff / Admin Login" link must be added to the footer in `src/layouts/BaseLayout.astro`.

---

## 5. Verification Method

To independently verify the observations, architecture, and proposed changes:

1. **Codebase Inspection**:
   - Inspect `src/lib/auth.ts`: Verify `verifyAccessJwt` (lines 64–118) and `getStaffContext` (lines 120–134).
   - Inspect all `/admin/*` and `/api/admin/*` routes to confirm server-side `requireRole` and `validateOrigin` calls.
   - Inspect `wrangler.jsonc`: Confirm `d1_databases` separation and absence of `r2_buckets` in the `previews` block.
   - Inspect `src/pages/api/booking/upload-evidence.ts:29`: Confirm `if (!env.EVIDENCE_BUCKET)` returns 503.

2. **Local Test Execution**:
   Run the project test commands:
   ```powershell
   npm run test
   npm run typecheck
   npm run build
   ```

3. **Provisioning Verification (Preview-Only)**:
   Verify the safe first-owner provisioning command:
   ```powershell
   npx wrangler d1 execute hsr_green_energy_preview --remote --command "INSERT INTO staff_users (email, role, is_active) VALUES ('owner@example.com', 'OWNER', 1) ON CONFLICT(email) DO UPDATE SET role = 'OWNER', is_active = 1;"
   ```

4. **Invalidation Conditions**:
   - The security assessment is invalidated if client-supplied headers are trusted for role resolution.
   - The R2 assessment is invalidated if `hsr-prod` is bound under `previews.r2_buckets`.
   - The content CMS design is invalidated if raw untrusted HTML is rendered via `set:html` or `dangerouslySetInnerHTML`.
