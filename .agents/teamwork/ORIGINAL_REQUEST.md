# Original User Request

## Parameters
[skip-interview]
How this run was launched; not part of the task.

## Initial Request — 2026-11-12T21:25:46Z

# HSR GREEN ENERGY — FULL PRODUCT, UI/UX, ENGINEERING AND QUALITY IMPROVEMENT PROGRAMME

## 1. Your role

Act as the multidisciplinary senior engineering and product team responsible for making the existing HSR Green Energy website a complete, reliable, production-quality CNG cylinder testing appointment and operations platform.

You are not being asked to create a new website, redesign one screen, or merely make the existing code compile.

You must understand the entire existing project, what each page and feature was intended to accomplish, what is incomplete, how different parts connect, what a real customer or employee needs to do, and what must change to make the system dependable.

Work to the standard of an experienced:
- Product architect
- UX researcher
- UI design lead
- Senior Astro/TypeScript developer
- Cloudflare Workers and D1 engineer
- Database and booking-system engineer
- Security engineer
- QA automation engineer
- Technical SEO and performance specialist

Use the installed skills relevant to each task. Do not merely mention that a skill exists. Read its actual `SKILL.md` instructions and apply them.

Go through the whole project from start to finish, understand it, read it, understand the whole structure, understand UI/UX, what can you do, how to improve.

## Existing project — mandatory identification

Repository: `DeepakOla/HSR`

Existing local project folder:

`C:\Users\HP\Downloads\HSR CNG`

Existing development branch:

`copilot/build-cng-cylinder-hydro-testing-website`

Existing PR:

`https://github.com/DeepakOla/HSR/pull/1`

Technology stack:

- Astro
- React
- TypeScript
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Wrangler
- Vitest
- Playwright

Preserve this stack unless a specific, evidence-based problem requires a change and the reason is documented.

Do not migrate this project to Next.js, Firebase, Supabase, a new booking SaaS, or another framework merely because a skill or template recommends it.

This is the existing HSR business application. Understand it before editing it.

## 2. Read the existing project instructions

Read these files completely before starting:

1. `AGENTS.md`
2. `ANTIGRAVITY_START_HERE.md`
3. `README.md`
4. `docs/architecture.md`
5. `docs/deployment.md`
6. `docs/security.md`
7. `docs/setup-required.md`
8. All previous user requirements and the complete customer feedback implementation brief already supplied in this conversation.

Inspect Git state first:

- `git status --short --branch`
- `git branch --show-current`
- `git remote -v`
- `git log -1 --oneline`
- `git diff`

The expected working branch is `copilot/build-cng-cylinder-hydro-testing-website`.

Do not assume the local branch is identical to GitHub. If it is outdated, has unexpected modifications or is on another branch, report that fact and preserve the user's work.

Never run destructive Git commands.

Do not switch branches, reset, clean, stash, rebase, force-push, commit, push or merge without explicit user approval.

## 3. Use specialist agents for independent investigations

Delegate separate read-only investigations to specialists:

**Agent A — Product and UI/UX architect**

Investigate the complete public website, user journeys, page hierarchy, visual identity, design system, navigation and usability. Use the installed skills: `ui-ux-pro-max`, `frontend-design`, and `web-perf`.

**Agent B — Booking and business logic engineer**

Investigate all booking workflows, availability calculations, cylinder allocations, pricing, advances, payments, booking statuses, concurrency and database consistency.

**Agent C — Security and Cloudflare architect**

Investigate authentication, Cloudflare Access, D1, R2, Worker configuration, API security, secrets, permissions and deployment separation. Use the installed skills: `cloudflare-one`, `workers-best-practices`, `workers-development`, `wrangler`.

**Agent D — QA and accessibility engineer**

Investigate every route, form, button, interaction, responsive state, API and test. Find missing E2E coverage and design an exhaustive test matrix.

The agents must not independently overwrite application files during this investigation. The main agent must consolidate their findings and resolve conflicts.

## 4. Skills to use

The following skills are already installed and should be actively used (read their SKILL.md and apply):
- `ui-ux-pro-max` — UI/UX design intelligence
- `frontend-design` — Distinctive frontend design guidance
- `cloudflare-one` — Cloudflare Zero Trust
- `workers-best-practices` — Cloudflare Workers best practices
- `workers-development` — Workers local dev and debugging
- `wrangler` — Wrangler CLI
- `frameworks-on-cloudflare` — Framework deployment on CF Workers
- `web-perf` — Web performance and Core Web Vitals

## 5. Customer Feedback Implementation Requirements

### 5.1 Temporary advance amount and pricing

Keep the current base price structure:

- Base service price: ₹2,500 per CNG cylinder.
- GST: retain the existing configurable 18% calculation for now. Do not represent this as a legal determination of the applicable tax treatment.
- Total for one cylinder: ₹2,500 + ₹450 GST = ₹2,950.
- Temporary advance: **₹500 per booking**, irrespective of cylinder count, until the owner decides a different amount.
- The remaining amount must be calculated as total payable minus ₹500.

Examples:
- 1 cylinder: total ₹2,950; advance ₹500; balance ₹2,450.
- 2 cylinders: total ₹5,900; advance ₹500; balance ₹5,400.
- 4 cylinders: total ₹11,800; advance ₹500; balance ₹11,300.

This is a flat advance per booking, not ₹500 per cylinder.

Implement the ₹500 default consistently for public online booking options 1–6. Make it editable in Owner Settings so the owner can change it later. Do not overwrite an amount that the owner has already deliberately configured.

Use a safe, forward-only migration if the Preview database requires it. Do not edit old migrations that have already been applied.

**Important payment gate:** a non-zero advance alone is insufficient. Online booking must not create a payment hold unless the merchant UPI VPA and payee name are also configured and usable. The current application uses UPI intent/QR and customer UTR/reference submission; preserve that approach. Do not introduce a payment gateway or claim that a UPI payment has been verified automatically.

When payment setup is incomplete, show a clear phone/WhatsApp booking route and do not create a customer hold that has no usable payment instructions.

The customer must see the same price, GST, advance and balance consistently in the cylinder selection step, final confirmation step and booking result.

### 5.2 Vehicle selection and cylinder count

The customer journey should ask:

**Step 1 — Date**

Select an available appointment date.

**Step 2 — Vehicle**

Ask: "Which vehicle do you have?"

Provide a dropdown with the existing relevant vehicle types:
- Car
- Taxi
- Tempo
- Van
- LCV
- Truck
- Bus
- Other

Keep a separate optional make/model field, such as Maruti WagonR, Tata 407 or another vehicle model.

When the customer selects Truck, automatically preselect **4 CNG cylinders**. The customer may change the count if the actual vehicle has a different number.

**Step 3 — Number of CNG cylinders**

The public customer dropdown must contain:
- 1 cylinder
- 2 cylinders
- 3 cylinders
- 4 cylinders
- 5 cylinders
- 6 cylinders
- More than 6

When "More than 6" is selected, stop the online self-service booking path and show a clear contact-the-centre option.

Do not merely hide options in React. Enforce the public limit in the public API and server-side booking validation as well. A customer must not be able to bypass the limit by manually modifying a request.

Keep internal database history and the receptionist's manual booking capability intact. Do not destroy existing 1–12 pricing records simply to change the public dropdown. Review the Owner Settings and receptionist workflows so that phone bookings for higher cylinder counts can still be handled safely where configured.

Update English and Hindi labels, API validation, tests, documentation and customer-facing messages consistently.

### 5.3 Time selection — hour first, exact time second

Replace the current flat list of appointment times with two linked dropdowns.

**First dropdown: select the hour**

For the current 06:00 opening schedule, examples would be:
- 6 AM
- 7 AM
- 8 AM
- 9 AM
- Continue through the configured closing time and any owner-enabled public extension.

**Second dropdown: select the exact starting time**

After the customer selects an hour, show only valid exact start times within that hour.

At the current 20-minute interval, examples are:
- 06:00
- 06:20
- 06:40
- 07:00
- 07:20
- 07:40

The hour list and exact-time list must be generated from the actual configured schedule and availability. Do not hardcode 6 AM to 9 AM or assume that the opening hours will never change.

Preserve the Owner Settings choice of either 15-minute or 20-minute intervals.

The options shown must already account for the selected cylinder count. For example, six cylinders at a 20-minute interval require six consecutive available work units (two hours). Do not show a starting time unless the entire consecutive run is available.

Display the expected start and finish time clearly. For example, a six-cylinder booking starting at 06:00 should display its calculated finish time.

Recheck availability at the server/database boundary when the customer submits. Two customers must not be able to reserve overlapping work units.

### 5.4 Date selection — proceed on one tap

At present, the customer selects a date and then has to press a separate Continue button.

Change this behaviour:

- One click or one tap on an available date should select it and move automatically to the vehicle-selection step.
- Do not require double-clicking.
- Remove the redundant Continue button from the date step if it is no longer needed.
- Disabled, past, outside-horizon and unavailable dates must remain unselectable.
- Preserve keyboard accessibility and visible focus states.
- Do not advance when the customer taps an unavailable date.

Test this on mobile and desktop.

### 5.5 Vehicle registration number validation

The vehicle registration field must not accept arbitrary text as a valid registration number.

Implement consistent client-side and server-side validation:
- Automatically convert entered letters to uppercase.
- Allow appropriate letters and digits, with spaces or hyphens accepted as input separators if needed.
- Normalize the value consistently before storage and duplicate matching.
- Reject unsupported symbols, arbitrary words, invalid lengths and obviously malformed registrations.
- Provide a useful validation message next to the field.
- Apply the same validation to public bookings, receptionist manual bookings and the cylinder-register workflow.

Do not use an unnecessarily restrictive pattern that rejects legitimate Indian registration formats. Check ordinary state-series registrations and Bharat Series (BH) registrations. Test valid and invalid examples. Keep the server as the final authority; browser-only validation is not sufficient.

Do not connect to or scrape VAHAN for personal vehicle-owner data.

### 5.6 Staff/Admin login and owner access

The project already contains:
- `/admin/login/`
- `/admin/owner/`
- `/admin/reception/`
- `/admin/register/`
- `/admin/reports/`
- `/admin/settings/`

The public website currently has no clear Staff/Admin login link.

Implement a discreet **Staff / Admin Login** link in the website footer in both English and Hindi. It should open `/admin/login/`. The staff-access page should have clearly labelled links to the Owner Console and Reception Desk.

The Owner Console should be the place where the owner can:
- Edit business details.
- Edit temporary advance and cylinder-count prices.
- Edit working days, opening hours, closing hours, breaks and appointment intervals.
- Enable or disable the additional hour and decide whether it is public or staff-only.
- Edit About, Services, How it works and Contact page content.
- Edit English and Hindi content separately.

Do not create an insecure public username/password system or allow users to choose their own OWNER role.

Investigate the Cloudflare Access setup in read-only mode first:
- Confirm which Access application protects the exact HSR Preview hostname.
- Confirm which login identity provider is configured and why the provider/display name appears as "Power".
- Determine whether this is merely the identity-provider display name or an incorrect application/policy association.
- Confirm the Preview `ACCESS_TEAM_DOMAIN` and `ACCESS_AUDIENCE` configuration.
- Confirm whether the owner's email has an active `OWNER` entry in the Preview `staff_users` table.

Do not delete, rename or modify any existing Power project, Access application, identity provider or policy without first identifying exactly what it protects and obtaining approval for the specific change.

Cloudflare Access authenticates the identity; the HSR `staff_users` table determines the application role. Both must be correct. Do not bypass either layer.

If a first-owner database record is missing, document the exact safe Preview-only provisioning method and request approval before executing the remote write. Never create an owner by accepting a role from a public form.

### 5.7 Complete the public website content

The current About, Services, How it works and Contact pages display a generic "being prepared" message because the database content is `SETUP_REQUIRED`.

The current Owner Settings does not have a page-content editor. The pages read from `localized_content`, but there is no owner-facing editor/API to update those records.

Implement a proper bilingual content-management section in the Owner Console.

Required pages:
1. About HSR Green Energy.
2. Services.
3. How the testing and booking process works.
4. Contact.
5. Review the homepage and footer for missing, misleading or placeholder content.

For every editable page, support:
- English title and content.
- Hindi title and content.
- Safe section headings, paragraphs and bullet lists.
- Preview before publishing.
- Save confirmation and clear validation errors.
- Audit logging of owner content changes.

Use a safe structured-content approach or a properly sanitised renderer. Do not render raw, untrusted HTML or introduce unsafe `dangerouslySetInnerHTML` usage.

The Contact page should display the business phone, WhatsApp, email, actual address, directions/map and working hours whenever those values are configured. It should not show dead links or fake contact information. Do not build a contact form that falsely reports successful delivery when no email/message-delivery service exists.

Make the business profile and contact fields editable in the Owner Console. Keep missing real-world details clearly marked as pending setup until the owner supplies them.

### Research rules for the website copy

Research before writing any regulatory or technical claim.

Use primary and official sources first, especially:
- PESO Gas Cylinders Rules, 2016 and current amendments.
- PESO's current cylinder testing station SOP and FAQs.
- PESO's current list of approved CNG cylinder testing stations.
- Current PESO circulars and directions relevant to CNG cylinder testing and test certificates.
- Relevant Ministry of Road Transport and Highways / Central Motor Vehicles Rules material for vehicle registration formats where needed.

Useful official starting points:
- https://www.peso.gov.in/en/gas-cylinder-rules-2016
- https://www.peso.gov.in/web/en/circular
- https://www.peso.gov.in/web/en/approved-cng-cylinders-testing-station
- https://www.morth.nic.in/

Research the current rules, not just older summaries. Record the exact source, date/version and what the source supports.

Do not claim that HSR is PESO-approved, recognised, accredited, certified, authorised or operational unless the relevant evidence has been supplied and independently verified.

Do not invent:
- Approval numbers.
- Accreditation details.
- Testing equipment or facility capabilities.
- Qualified technical staff.
- Certifications.
- Customer testimonials.
- Exact statutory retesting periods.
- Guaranteed turnaround times.
- Prices not approved by the owner.
- A physical address, phone number or map location.

Separate verified business facts from proposed services and pending approvals. Draft customer-friendly English and Hindi copy, but leave unverified claims unpublished or clearly marked for owner review.

The user's intended operating scope is CNG cylinder testing for cars, LCV/Tempo and heavy trucks. Do not extend this scope to other vehicle or cylinder classes without verification.

### 5.8 Owner Console page editor and saving behaviour

The content editor must save to the existing project's database using authenticated owner-only APIs.

Implement appropriate API validation, same-origin protection, audit events and error handling.

The Owner Console should clearly separate:
- Business profile/contact details.
- Cylinder pricing and advances.
- Operating schedule.
- Website content (English and Hindi).

Do not require the owner to edit source code or manually update SQL just to change a page paragraph, phone number or advance amount.

### 5.9 Full testing requirements

Do not stop after the website builds.

Run:
- Lint.
- Type checking.
- Unit tests.
- Astro production build.
- Cloudflare Worker bundle/dry-run validation.
- Browser E2E tests for the real customer and staff workflows.

Add or update tests for:
- ₹500 flat advance and correct balance calculations.
- Online payment disabled when UPI merchant configuration is missing.
- Public cylinder-count limit of 1–6, including API tampering attempts for 7+.
- Truck default of 4 cylinders.
- 15- and 20-minute schedules.
- Hour dropdown and exact-time dropdown filtering.
- Continuous work-unit availability for the selected cylinder count.
- Single-tap date progression.
- Registration number valid/invalid cases, including BH Series.
- English and Hindi page content.
- Owner-only content edits and persistence.
- Admin authentication and role enforcement.
- No unauthenticated access to owner/reception APIs.
- Duplicate/overlapping booking prevention.
- Customer booking, UPI instructions, UTR submission and booking-status page.
- Mobile and desktop layout and keyboard accessibility.

For browser E2E tests, use synthetic customer and vehicle data only. Use Preview, not Production. Any test that creates a remote Preview booking or writes to Preview D1 must be clearly identified and approved before execution. Do not use real customer details.

The Preview R2 bucket is intentionally not configured. Do not connect the Production bucket to Preview. Keep screenshot upload disabled unless a separate test bucket is approved and configured.

### 5.10 Deliverables and completion report

Work in phases:

**Phase A — Audit and plan**
- Inspect the entire existing booking, pricing, admin, authentication, content and database implementation.
- Identify dependencies and migration impact.
- Produce a file-by-file implementation plan and list any genuinely unresolved business decisions.
- Do not rewrite working modules unnecessarily.

**Phase B — Implement**
- Make the requested UI, validation, API, admin and content-management changes in the existing branch.
- Add only safe forward migrations where needed.
- Keep English and Hindi aligned.
- Preserve existing booking records, database constraints, audit logs and payment safeguards.

**Phase C — Verify**
- Run the full local test suite and browser tests.
- Review the complete Git diff.
- Identify any tests that could not be run and explain why.
- Do not claim success for anything that was not actually tested.

**Phase D — Preview readiness**
- Prepare a safe Preview deployment and migration plan.
- Inspect the actual Preview bindings and Access configuration.
- Do not apply remote Preview migrations, change Access policies or deploy Preview until the owner approves those specific operations.
- Never deploy Production or merge PR #1.

At the end, provide:
1. Files changed.
2. Database migration changes.
3. Features completed.
4. Tests run and their actual results.
5. Features still blocked by missing business details or Cloudflare configuration.
6. Exact steps the owner must follow to log in and edit the site.
7. Exact Preview-only commands, clearly distinguished from Production commands.
8. The remaining issues that must be resolved before PR #1 can be made ready for review.

Do not mark the project complete merely because it builds. The customer journey, owner editing, staff authentication, payment setup and Preview behaviour must all be verified.

## AGENTS.md rules (from the workspace)

- Active capacity states are `HELD`, `PENDING_VERIFICATION`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`.
- Hold expiry only auto-expires `HELD` + `ADVANCE_PENDING` bookings.
- Do not auto-release bookings after evidence submission.
- Use atomic DB-guarded writes for hold creation.
- Preserve snapshot pricing, slot labels, capacity and config version on each booking.
- UPI link/QR does not verify payment.
- Evidence and UTR set booking to `PENDING_VERIFICATION`/`EVIDENCE_SUBMITTED`.
- R2 is private and optional; when unavailable, website screenshot upload must be disabled.
- Protect admin pages and APIs server-side.
- Never trust role or pricing from browser.
- Public APIs must not leak customer PII.
- Testing commands: `npm run test`, `npm run typecheck`, `npm run build`
