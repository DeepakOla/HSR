# Handoff Report: Reviewer M2-2 (Database, Concurrency & Security Review)

**Agent**: Reviewer M2-2 (Database, Concurrency & Security Review)  
**Roles**: reviewer, critic  
**Date**: 2026-11-13T07:40:00Z  
**Status**: COMPLETE (Hard Handoff)  
**Recipient**: Orchestrator (`423f96b4-d134-4c92-9308-9dcadcc0a1a3`)  
**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Integrity Violation Assessment
No integrity violations were detected. Specifically:
- **No hardcoded test results**: `src/pages/api/booking/create-hold.ts` and `src/lib/booking-engine.ts` compute prices dynamically via `calculateBookingPrice` and execute parameterized database queries. No test IDs or vehicle numbers are hardcoded.
- **Genuine logic implementation**: Core concurrency exclusion, pre-write payment gating, public cylinder restrictions, and idempotency guarantees are implemented directly with transactional D1 batches and SQL triggers (`bookings_capacity_guard`).
- **No bypassed tasks**: All requirements from Milestone M2 (flat ₹500 advance, pre-write payment gating, server-side public cylinder cap of 6, receptionist exemption for 7–12 cylinders, vehicle registration validation integration, atomic capacity conflict handling) were verified in actual code.
- **Independent verification**: All test, typecheck, and build commands were executed independently during this review session.

### 1.2 Database Migration Verification (`migrations/0006_flat_advance.sql`)
- **File inspected**: `migrations/0006_flat_advance.sql` (lines 1–29):
  ```sql
  ALTER TABLE business_settings ADD COLUMN flat_advance_paise INTEGER NOT NULL DEFAULT 50000;

  UPDATE business_settings 
  SET business_name_en = 'HSR', business_name_hi = 'एचएसआर'
  WHERE business_name_en IS NULL 
     OR business_name_en = '' 
     OR business_name_en = 'SETUP_REQUIRED' 
     OR business_name_en = 'HSR Green Energy';

  UPDATE business_settings 
  SET city = 'Rewari'
  WHERE city IS NULL 
     OR city = '' 
     OR city = 'SETUP_REQUIRED';

  UPDATE business_settings 
  SET contact_phone = '+919910055355', whatsapp_number = '+919910055355'
  WHERE contact_phone IS NULL 
     OR contact_phone = '' 
     OR contact_phone = 'SETUP_REQUIRED';

  INSERT INTO staff_users (email, role, is_active)
  VALUES ('kumardeepakola@gmail.com', 'OWNER', 1)
  ON CONFLICT(email) DO UPDATE SET role = 'OWNER', is_active = 1;
  ```
- **Custom Detail Preservation**: If any of `business_name_en`, `city`, or `contact_phone` was previously configured with authentic custom details, it does not match the `WHERE ... IS NULL OR ... = '' OR ... = 'SETUP_REQUIRED'` criteria and is completely preserved.
- **Idempotent Staff Upsert**: `staff_users.email` is defined as `TEXT NOT NULL UNIQUE` (`migrations/0001_init.sql:35`). The `ON CONFLICT(email) DO UPDATE SET role = 'OWNER', is_active = 1` clause executes cleanly and idempotently across repeated runs without duplicate key violations or data loss.

### 1.3 Pre-Write Payment Gating & Zero D1 Writes
- **File inspected**: `src/pages/api/booking/create-hold.ts` (lines 63–89):
  - Queries `settings = await getBusinessSettings(db)`.
  - Checks `const isPaymentConfigured = !!vpaId && vpaId !== 'SETUP_REQUIRED' && !!payeeName && payeeName !== 'SETUP_REQUIRED';`.
  - If unconfigured, immediately returns HTTP 422 with `ONLINE_PAYMENT_UNAVAILABLE` and contact object (`phone`, `whatsapp`, `whatsappUrl`).
  - **Zero D1 Writes Verified**: Tested in `tests/booking-hold.test.ts:111-144`. Row counts for `bookings`, `booking_slot_allocations`, `customers`, `vehicles`, `booking_audit_events`, and `idempotency_keys` remain exactly 0 after rejection.

### 1.4 Server-Side Public Cylinder Limitation & Tampering
- **File inspected**: `src/pages/api/booking/create-hold.ts` (lines 92–122):
  - Fetches category by `categoryId`.
  - Rejects if `categoryRow.cylinderCount > 6` with HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED` and returns contact card.
  - Defense-in-depth verified in `src/lib/booking-engine.ts:275-277`.
  - Receptionist exemption verified in `tests/booking-hold.test.ts:295-319`: bookings with source `PHONE`/`WALKIN` for 7–12 cylinders succeed.

### 1.5 Concurrency Handling & Capacity Conflict (HTTP 409)
- **Database Trigger**: `migrations/0005_cylinder_work_units.sql:230-274` (`bookings_capacity_guard`). Enforces consecutive, unoccupied work-unit runs at the database write boundary with `RAISE(ABORT, 'CONSECUTIVE_CAPACITY_EXCEEDED')`.
- **API Status Mapping**: `src/pages/api/booking/create-hold.ts:180-181` catches `capacity_exceeded` and maps it to HTTP 409 `CAPACITY_CONFLICT`.
- **Stress-Test Results**:
  - `tests/challenger-m2.test.ts`: Scenario 1 (10 concurrent requests racing for the same slot) resulted in exactly 1 HTTP 201 and 9 HTTP 409 responses, with zero double allocations.
  - Scenario 2 (4 concurrent requests competing for overlapping multi-cylinder work units) resulted in atomic mutual exclusion.

### 1.6 Verification Commands Executed Verbatim
1. **`npm run test`**:
   ```
   Test Files  10 passed (10)
        Tests  192 passed (192)
     Duration  85.46s
   ```
2. **`npx vitest run tests/challenger-m2.test.ts`**:
   ```
   Test Files  1 passed (1)
        Tests  15 passed (15)
     Duration  47.89s
   ```
3. **`npm run typecheck` (`astro check`)**:
   ```
   Result (88 files): 
   - 0 errors
   - 0 warnings
   - 1 hint
   ```
4. **`npm run build` (`astro build`)**:
   ```
   [@astrojs/cloudflare] Injected immutable Cache-Control for /_astro/* into _headers.
   Server built in 1m 17s
   Complete!
   ```

---

## 2. Logic Chain

1. **Database Integrity & Idempotency**:
   - Observation 1.2 demonstrates that `0006_flat_advance.sql` uses non-destructive conditional `WHERE` filters and standard SQLite `ON CONFLICT(email)` upsert syntax matching the `UNIQUE` index on `staff_users(email)`.
   - Therefore, the migration can be safely and idempotently applied to local, preview, and future databases without corrupting owner configuration.

2. **Pre-Write Gating & Zero D1 Writes**:
   - Observation 1.3 confirms that `create-hold.ts` evaluates payment readiness (`vpa_id` and `vpa_payee_name`) and cylinder counts before invoking `createHold` or constructing any write statements.
   - The test assertions directly inspect all write tables in D1/SQLite and confirm count = 0.
   - Therefore, no orphaned customers, vehicles, or holding records can be generated by unpayable web requests or tampering attempts.

3. **Concurrency & Capacity Guard**:
   - Observation 1.5 confirms that concurrency protection is enforced at two distinct boundaries: application slot search (`findConsecutiveAvailableSlots`) and atomic database trigger (`bookings_capacity_guard` inside `db.batch()`).
   - Even under adversarial parallel load (10 racing workers in `tests/challenger-m2.test.ts`), atomic batch transaction isolation ensures that exactly one transaction succeeds and the rest are aborted with `CONSECUTIVE_CAPACITY_EXCEEDED` and mapped to HTTP 409 `CAPACITY_CONFLICT`.
   - Therefore, race conditions cannot produce double bookings or split allocations.

4. **Security Boundaries & Injection Safety**:
   - All SQL queries across `create-hold.ts` and `booking-engine.ts` use parameterized SQL with positional `?` bindings. No dynamic SQL strings are constructed from user input.
   - Origin validation (`validateOrigin`), rate limiting (`checkRateLimit`), and vehicle registration validation (`validateVehicleRegistration`) precede all database operations.

---

## 3. Caveats

- **Preview-Only Application**: `0006_flat_advance.sql` must only be applied to local SQLite and the preview D1 database (`npm run db:migrate:preview`). In accordance with project invariants, no writes should be executed against Production.
- **Default VPA State**: On fresh databases, `vpa_id` and `vpa_payee_name` default to `'SETUP_REQUIRED'`. As intended, online self-service booking will return HTTP 422 until the owner updates these values via the Owner Console.

---

## 4. Conclusion

The Milestone M2 implementation strictly satisfies all business requirements, database integrity constraints, concurrency guarantees, and security invariants.
- Forward migration `0006_flat_advance.sql` is safe and idempotent.
- Zero D1 writes are guaranteed on unconfigured payments, invalid registrations, and cylinder count tampering (> 6).
- Concurrency conflicts are gracefully rejected with HTTP 409 `CAPACITY_CONFLICT` backed by atomic D1 triggers.
- All test suites (192 unit/integration tests + 15 adversarial challenger tests) pass with 0 type errors and clean production builds.

**Verdict: APPROVE**

---

## 5. Verification Method

To independently verify this evaluation:
1. Run test suite:
   ```powershell
   npm run test
   ```
   *Expected*: 10 test files pass, 192 tests pass.
2. Run adversarial challenger suite:
   ```powershell
   npx vitest run tests/challenger-m2.test.ts
   ```
   *Expected*: 15 tests pass, including 10-client concurrent race conditions.
3. Run typecheck:
   ```powershell
   npm run typecheck
   ```
   *Expected*: 0 errors.
4. Run production build:
   ```powershell
   npm run build
   ```
   *Expected*: `Complete!` with Cloudflare Worker server output.
5. Invalidation conditions:
   - Any D1 write occurring when `vpa_id` or `vpa_payee_name` is `'SETUP_REQUIRED'`.
   - Any booking created via `WEB` with cylinder count > 6.
   - Any double-booking occurring under concurrent requests for identical slots.
