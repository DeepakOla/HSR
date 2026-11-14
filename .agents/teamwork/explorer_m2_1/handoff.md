# Handoff Report: Explorer M2-1 (Database Migration & Schema)

## Executive Summary
This report provides the exhaustive investigation results for Milestone M2-1 regarding the Cloudflare D1 database schema, existing migrations (`migrations/0001_init.sql` through `0005_cylinder_work_units.sql`), the forward-only migration design for `migrations/0006_flat_advance.sql`, test database seeding dynamics via `tests/helpers/d1-mock.ts`, and TypeScript type definitions for `business_settings`.

---

## 1. Observation

### 1.1 Existing Migrations (`migrations/0001_init.sql` through `0005_cylinder_work_units.sql`)
1. **`migrations/0001_init.sql`** (lines 8–31):
   - `business_settings` table is defined as:
     ```sql
     CREATE TABLE IF NOT EXISTS business_settings (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       business_name_en TEXT NOT NULL DEFAULT 'HSR Green Energy',
       business_name_hi TEXT NOT NULL DEFAULT 'एचएसआर ग्रीन एनर्जी',
       city TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
       address_line TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
       map_url TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
       contact_phone TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
       whatsapp_number TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
       contact_email TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
       vpa_id TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
       vpa_payee_name TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
       hold_minutes INTEGER NOT NULL DEFAULT 15 CHECK (hold_minutes BETWEEN 5 AND 120),
       r2_enabled INTEGER NOT NULL DEFAULT 0 CHECK (r2_enabled IN (0,1)),
       evidence_budget_bytes INTEGER NOT NULL DEFAULT 8589934592,
       timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
       seo_title_en TEXT NOT NULL DEFAULT 'CNG Cylinder Testing & Retesting Centre in [City]',
       seo_title_hi TEXT NOT NULL DEFAULT '[शहर] में सीएनजी सिलेंडर टेस्टिंग और रिटेस्टिंग केंद्र',
       seo_desc_en TEXT NOT NULL DEFAULT 'Professional CNG cylinder hydro testing and retesting booking. Business details pending owner setup.',
       seo_desc_hi TEXT NOT NULL DEFAULT 'सीएनजी सिलेंडर हाइड्रो टेस्टिंग और रिटेस्टिंग बुकिंग। व्यावसायिक जानकारी मालिक द्वारा सेटअप लंबित।',
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     );

     INSERT OR IGNORE INTO business_settings(id) VALUES(1);
     ```
   - **Crucial observation on initial brand name**: `business_name_en` defaulted to `'HSR Green Energy'` and `business_name_hi` to `'एचएसआर ग्रीन एनर्जी'`.
   - `city`, `contact_phone`, `whatsapp_number`, `vpa_id`, `vpa_payee_name` defaulted to `'SETUP_REQUIRED'`.
   - `flat_advance_paise` column **does not exist** in `0001_init.sql`.

2. **`migrations/0001_init.sql`** (lines 33–39):
   - `staff_users` table is defined as:
     ```sql
     CREATE TABLE IF NOT EXISTS staff_users (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       email TEXT NOT NULL UNIQUE,
       role TEXT NOT NULL CHECK (role IN ('OWNER', 'RECEPTIONIST')),
       is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     );
     ```
   - **Crucial observation on initial staff**: No initial rows were inserted into `staff_users` in `0001_init.sql`. The owner email `kumardeepakola@gmail.com` is currently absent from the baseline migration.

3. **`migrations/0002_capacity_guard.sql`**:
   - Implemented initial trigger `bookings_capacity_guard` on `bookings` enforcing slot and daily limits.

4. **`migrations/0003_amount_paid.sql`**:
   - Added `amount_paid_paise` column to `bookings`:
     ```sql
     ALTER TABLE bookings
     ADD COLUMN amount_paid_paise INTEGER NOT NULL DEFAULT 0
     CHECK (amount_paid_paise >= 0 AND amount_paid_paise <= total_price_paise_snapshot);
     ```

5. **`migrations/0004_schedule_versions.sql`**:
   - Created `schedule_versions` table and backfilled initial version from `daily_slot_snapshots`.

6. **`migrations/0005_cylinder_work_units.sql`**:
   - Added work-unit interval columns to `weekly_schedule`, `slot_templates`, `daily_slot_snapshots`.
   - Added `vehicle_type` to `vehicles` and `bookings`.
   - Created `booking_slot_allocations` table.
   - Deactivated historical vehicle categories (`CAR_TAXI_1`, `CAR_LCV_2`, `HEAVY_TRUCK_4`).
   - Inserted 12 cylinder categories (`CYL_01` to `CYL_12`) with `advance_paise = NULL` (lines 58–87).
   - Replaced trigger `bookings_capacity_guard` to enforce consecutive work units.
   - Created trigger `release_booking_slot_allocations` to free allocations on cancellation/expiry.

### 1.2 Test Database Seeding (`tests/helpers/d1-mock.ts` & `tests/helpers/test-harness.test.ts`)
1. **Dynamic migration execution in `tests/helpers/d1-mock.ts`** (lines 164–185):
   ```typescript
   export function createMockD1(options: CreateMockD1Options = {}): MockD1Database {
     const rawDb = new DatabaseSync(':memory:');
     rawDb.exec('PRAGMA foreign_keys = ON;');

     const applyMigrations = options.applyMigrations ?? true;
     if (applyMigrations) {
       const migrationsDir = options.migrationsDir ?? path.resolve(process.cwd(), 'migrations');
       if (fs.existsSync(migrationsDir)) {
         const files = fs
           .readdirSync(migrationsDir)
           .filter((file) => file.endsWith('.sql'))
           .sort();

         for (const file of files) {
           const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
           rawDb.exec(sql);
         }
       }
     }

     return new MockD1Database(rawDb);
   }
   ```
   - `createMockD1` **does not hardcode SQL seeds**. It reads every `.sql` file in the `migrations/` directory alphabetically and executes it directly on a fresh in-memory `node:sqlite` instance.
   - When `migrations/0006_flat_advance.sql` is placed in `migrations/`, it is automatically executed on every `createMockD1()` call across all test suites.

2. **Existing test suite results (`npm run test`)**:
   - 9 test files passed: 136 tests passing (including `appointment-slots`, `security`, `vehicle-registration`, `schedule`, `pricing`, `routes`, `utils`, `expiry`, and `test-harness.test.ts`).

3. **Typecheck diagnostics (`npm run typecheck` / `astro check`)**:
   - Running `npm run typecheck` returned 13 errors located entirely in `tests/helpers/d1-mock.ts` and `tests/helpers/test-harness.test.ts`:
     - `MockD1Database` is missing `withSession(token?: string): D1DatabaseSession;` required by `D1Database` in `@cloudflare/workers-types` v5.20261112.1.
     - `MockD1PreparedStatement.run()` returns `Promise<D1Response>` instead of `Promise<D1Result<T>>` (requires `results: T[]`).
     - `D1Meta` requires properties: `size_after`, `rows_read`, `rows_written`, `last_row_id`, `changed_db`.
     - `statement as MockD1PreparedStatement` in `batch()`.
     - Unused imports `generateMockKeyPair` and `createMockSignedJwt` in `tests/helpers/test-harness.test.ts`.

### 1.3 TypeScript Schema Types for `business_settings`
1. **`src/lib/types.ts`** (lines 1–20):
   ```typescript
   export interface BusinessSettings {
     business_name_en: string;
     business_name_hi: string;
     city: string;
     address_line: string;
     map_url: string;
     contact_phone: string;
     whatsapp_number: string;
     contact_email: string;
     vpa_id: string;
     vpa_payee_name: string;
     hold_minutes: number;
     r2_enabled: number;
     evidence_budget_bytes: number;
     timezone: string;
     seo_title_en: string;
     seo_title_hi: string;
     seo_desc_en: string;
     seo_desc_hi: string;
   }
   ```
   - Currently missing: `flat_advance_paise: number;`.

2. **`src/pages/api/admin/settings.ts`** (lines 9–26):
   - `editableSchema` validates owner-editable settings via Zod with `.strict()`:
     ```typescript
     const editableSchema = z.object({
       business_name_en: z.string().trim().min(2).max(120).optional(),
       business_name_hi: z.string().trim().min(2).max(120).optional(),
       city: z.string().trim().min(2).max(120).optional(),
       // ...
     }).strict();
     ```
   - Because of `.strict()`, any update request sending `flat_advance_paise` will be rejected as invalid unless `flat_advance_paise: z.number().int().min(0).max(10_000_000).optional()` is explicitly declared.

3. **`src/components/admin/OwnerSettings.tsx`** (lines 5–9):
   - Local `type Profile` defines the settings object for the Owner Console UI:
     ```typescript
     type Profile = {
       business_name_en: string; business_name_hi: string; city: string; address_line: string; map_url: string;
       contact_phone: string; whatsapp_number: string; contact_email: string; vpa_id: string; vpa_payee_name: string;
       hold_minutes: number; seo_title_en: string; seo_title_hi: string; seo_desc_en: string; seo_desc_hi: string;
     };
     ```
   - Currently missing: `flat_advance_paise: number;`.

4. **`src/pages/api/public/config.ts`** (lines 5–21):
   - Exposes public business settings to clients. It currently does not return `flatAdvancePaise`.

---

## 2. Logic Chain

### 2.1 Forward-Only Migration Specification (`migrations/0006_flat_advance.sql`)
1. **Adding `flat_advance_paise`**:
   - Standard SQLite and Cloudflare D1 allow `ALTER TABLE ... ADD COLUMN ...`.
   - Because `business_settings` already has a row (`id = 1`), SQLite requires a default value for non-null column additions.
   - Using `ALTER TABLE business_settings ADD COLUMN flat_advance_paise INTEGER NOT NULL DEFAULT 50000;` guarantees backward-compatible execution without table locks or migration failures.
   - 50,000 paise = ₹500 flat advance per booking, satisfying Section 5.1 and confirmed project decisions.

2. **Updating Default Business Details without Overwriting Customizations**:
   - In `0001_init.sql`, `business_name_en` was seeded as `'HSR Green Energy'` and `business_name_hi` as `'एचएसआर ग्रीन एनर्जी'`.
   - In confirmed project decision #2 and UI/UX Direction A, the brand name is **HSR** (industrial engineering identity, removing "Green Energy").
   - If the update condition only looked for `business_name_en = 'SETUP_REQUIRED'` or empty, the seeded default `'HSR Green Energy'` would remain untouched!
   - Therefore, the UPDATE statement must target:
     ```sql
     UPDATE business_settings 
     SET business_name_en = 'HSR', business_name_hi = 'एचएसआर'
     WHERE business_name_en IS NULL
        OR business_name_en = ''
        OR business_name_en = 'SETUP_REQUIRED'
        OR business_name_en = 'HSR Green Energy';
     ```
     This safely updates unconfigured environments while preserving any custom business name an owner may have entered (e.g. `'HSR Testing Station'`).
   - For location (`city`), `0001_init.sql` seeded `'SETUP_REQUIRED'`. The UPDATE statement:
     ```sql
     UPDATE business_settings 
     SET city = 'Rewari'
     WHERE city IS NULL
        OR city = ''
        OR city = 'SETUP_REQUIRED';
     ```
     This sets default location to `Rewari` while protecting any custom city already configured.
   - For contact numbers (`contact_phone` and `whatsapp_number`), `0001_init.sql` seeded `'SETUP_REQUIRED'`. The UPDATE statement:
     ```sql
     UPDATE business_settings 
     SET contact_phone = '+919910055355', whatsapp_number = '+919910055355'
     WHERE contact_phone IS NULL
        OR contact_phone = ''
        OR contact_phone = 'SETUP_REQUIRED';
     ```
     This sets default contact channels to `+919910055355`.

3. **Provisioning Owner User in `staff_users`**:
   - Cloudflare Access authenticates identity (`kumardeepakola@gmail.com`), but `getStaffContext` in `src/lib/auth.ts` queries `SELECT role, is_active FROM staff_users WHERE email = ?`.
   - Without an active `OWNER` row in `staff_users`, Cloudflare Access logins result in HTTP 401/403.
   - `staff_users.email` has a `UNIQUE` constraint.
   - Using:
     ```sql
     INSERT INTO staff_users (email, role, is_active)
     VALUES ('kumardeepakola@gmail.com', 'OWNER', 1)
     ON CONFLICT(email) DO UPDATE SET role = 'OWNER', is_active = 1;
     ```
     ensures idempotency, provisions the owner on fresh or existing databases, and prevents errors if the user was previously seeded with an inactive status or different role.

### 2.2 Test Seeding Analysis
- Because `tests/helpers/d1-mock.ts` iterates over the `migrations/` folder and applies all `.sql` files in sorted order, creating `0006_flat_advance.sql` in `migrations/` immediately causes every test database in `vitest` to include the `flat_advance_paise` column and default business settings.
- We verified with a direct Node.js execution against `DatabaseSync` that applying `0001` through `0006` produces:
  - `flat_advance_paise: 50000`
  - `business_name_en: "HSR"`, `business_name_hi: "एचएसआर"`
  - `city: "Rewari"`
  - `contact_phone: "+919910055355"`
  - `whatsapp_number: "+919910055355"`
  - 1 active owner in `staff_users` (`kumardeepakola@gmail.com`).
- Existing tests in `tests/helpers/test-harness.test.ts` pass without conflicts because synthetic test users (e.g. `owner@hsr-test.internal`) use distinct email addresses.
- To maintain test hygiene and complete verification, `test-harness.test.ts` should be updated to assert these newly seeded defaults.

### 2.3 Required Codebase Adaptations for Milestone M2
To make the migration effective across the application:
1. **`src/lib/types.ts`**: Add `flat_advance_paise: number;` to `BusinessSettings`.
2. **`src/pages/api/admin/settings.ts`**: Add `flat_advance_paise: z.number().int().min(0).max(10_000_000).optional()` to `editableSchema`.
3. **`src/pages/api/public/config.ts`**: Add `flatAdvancePaise: settings.flat_advance_paise` to the returned payload.
4. **`src/lib/pricing.ts`**: Add `calculateBookingPrice(basePricePaise, flatAdvancePaise)` returning `BookingPriceBreakdown`.
5. **`src/pages/api/booking/create-hold.ts`**: Use `settings.flat_advance_paise` instead of category-level advance for web bookings.

---

## 3. Caveats
1. **Production Deployment Protection**: As specified in `AGENTS.md` and `PROJECT.md`, `migrations/0006_flat_advance.sql` must only be applied locally or to Preview D1 (`npm run db:migrate:preview`). **Zero production database migrations should be run.**
2. **Payment Gate Dependency**: Having `flat_advance_paise = 50000` enables advance calculation, but online booking holds must still be blocked pre-write if `vpa_id` or `vpa_payee_name` is unset or `'SETUP_REQUIRED'`. In `0001_init.sql`, `vpa_id` and `vpa_payee_name` remain `'SETUP_REQUIRED'`. This is intended: it ensures the pre-write payment gate routes customers to Phone/WhatsApp until the merchant details are supplied by the owner.
3. **TypeScript Errors in `d1-mock.ts`**: While `vitest` compiles and runs tests natively, `astro check` flags 13 typing mismatches between `MockD1Database` and `@cloudflare/workers-types` v5.20261112.1. These do not prevent Vitest execution, but should be addressed during M2 to achieve a clean `npm run typecheck`.

---

## 4. Conclusion
1. **Exact SQL content for `migrations/0006_flat_advance.sql`**:
   ```sql
   -- Migration 0006: Flat advance per booking and initial defaults
   ALTER TABLE business_settings ADD COLUMN flat_advance_paise INTEGER NOT NULL DEFAULT 50000;

   -- Set default business name to HSR if still unset, SETUP_REQUIRED, or initial placeholder
   UPDATE business_settings 
   SET business_name_en = 'HSR', business_name_hi = 'एचएसआर'
   WHERE business_name_en IS NULL 
      OR business_name_en = '' 
      OR business_name_en = 'SETUP_REQUIRED' 
      OR business_name_en = 'HSR Green Energy';

   -- Set default city to Rewari if still unset or SETUP_REQUIRED
   UPDATE business_settings 
   SET city = 'Rewari'
   WHERE city IS NULL 
      OR city = '' 
      OR city = 'SETUP_REQUIRED';

   -- Set default contact phone and WhatsApp to +919910055355 if still unset or SETUP_REQUIRED
   UPDATE business_settings 
   SET contact_phone = '+919910055355', whatsapp_number = '+919910055355'
   WHERE contact_phone IS NULL 
      OR contact_phone = '' 
      OR contact_phone = 'SETUP_REQUIRED';

   -- Ensure Owner user exists in staff_users for Cloudflare Access email
   INSERT INTO staff_users (email, role, is_active)
   VALUES ('kumardeepakola@gmail.com', 'OWNER', 1)
   ON CONFLICT(email) DO UPDATE SET role = 'OWNER', is_active = 1;
   ```
2. **Test Harness**: `createMockD1()` does not need structural changes to load the migration—it will automatically apply `0006_flat_advance.sql`.
3. **Type definitions**: `BusinessSettings` in `src/lib/types.ts` must be extended with `flat_advance_paise: number`.

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Verify D1 migration syntax in Node.js (in-memory SQLite)**:
   ```powershell
   node -e "
   const { DatabaseSync } = require('node:sqlite');
   const fs = require('fs');
   const path = require('path');
   const db = new DatabaseSync(':memory:');
   const files = fs.readdirSync('migrations').filter(f => f.endsWith('.sql')).sort();
   for (const file of files) {
     db.exec(fs.readFileSync(path.join('migrations', file), 'utf8'));
   }
   const settings = db.prepare('SELECT business_name_en, city, contact_phone, flat_advance_paise FROM business_settings WHERE id = 1').get();
   const owner = db.prepare('SELECT email, role, is_active FROM staff_users WHERE email = ?').get('kumardeepakola@gmail.com');
   console.log('Settings:', settings);
   console.log('Owner:', owner);
   "
   ```
   **Expected result**:
   - `Settings: { business_name_en: 'HSR', city: 'Rewari', contact_phone: '+919910055355', flat_advance_paise: 50000 }`
   - `Owner: { email: 'kumardeepakola@gmail.com', role: 'OWNER', is_active: 1 }`

2. **Execute Full Test Suite**:
   ```powershell
   npm run test
   ```
   **Expected result**: All 9 test suites and 136+ tests pass.

3. **Verify Typecheck**:
   ```powershell
   npm run typecheck
   ```
   **Expected result**: Verify diagnostics for Astro and TypeScript files.

### 5.2 Invalidation Conditions
- If `migrations/0006_flat_advance.sql` causes any failure in `createMockD1()` or breaks existing tests in `tests/helpers/test-harness.test.ts`.
- If an existing custom business name (other than `'HSR Green Energy'` or `'SETUP_REQUIRED'`) is overwritten by the UPDATE statement.
- If `kumardeepakola@gmail.com` fails to authenticate or lacks role `'OWNER'` in `staff_users`.
