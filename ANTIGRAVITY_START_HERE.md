# Antigravity handoff — HSR Green Energy

Last updated: 12 November 2026

## 1. Open the correct project

Open the existing folder in Antigravity using **Open Folder**:

`C:\Users\HP\Downloads\HSR CNG`

This folder should contain `package.json`, `wrangler.jsonc`, `AGENTS.md`, `README.md` and the `.git` directory. Open the folder itself, not a downloaded ZIP, not a second copied folder, and not an individual source file.

Before editing anything, read:
1. `AGENTS.md`
2. `ANTIGRAVITY_START_HERE.md`
3. `README.md`
4. `docs/deployment.md`

The existing Git repository is `https://github.com/DeepakOla/HSR`. Do not recreate it.

## 2. Git branch and current state

- Work branch: `copilot/build-cng-cylinder-hydro-testing-website`
- Pull request: [PR #1](https://github.com/DeepakOla/HSR/pull/1)
- PR #1 targets `main` and is OPEN / DRAFT / NOT MERGED.
- Keep all work on the existing branch.
- Never commit directly to `main`, merge PR #1, force-push, or deploy Production without the user's explicit approval.

The latest verified branch commit before this handoff update is `e21b3bebf84dfdaed660aa011fa684972ffc7c41`. CI run #81 passed. The booking UI API URL fixes and a JSON response guard are included in that commit. This handoff update also aligns the calendar with the configured 45-day-ahead booking window.

### First commands in the existing local folder

Use a PowerShell terminal opened at the project root:

```powershell
git rev-parse --show-toplevel
git status --short --branch
git branch --show-current
git remote -v
git log -1 --oneline
```

Expected branch:
`copilot/build-cng-cylinder-hydro-testing-website`

A prior local status showed a modified `package.json`. Inspect it with `git diff -- package.json` and preserve it until its purpose is understood. Do not discard or overwrite local changes. If the branch is behind GitHub, inspect status first, then use `git fetch origin` and a fast-forward-only update only when it will not overwrite local work.

After any Antigravity edits, inspect `git diff` and `git status`. The user will decide when to upload/push the finished work. Do not independently merge the PR.

## 3. Local development is not Cloudflare

The user has already successfully applied all five migrations to the **local Wrangler D1 database** on this laptop. The output explicitly said `Resource location: local` and used `--local`. This did not alter Cloudflare Preview or Production.

Local development:

```powershell
npm ci
npm run dev -- --host 127.0.0.1
```

Open the exact URL printed by Astro, previously:
- `http://127.0.0.1:4321/en/`
- `http://127.0.0.1:4321/hi/`
- `http://127.0.0.1:4321/en/book/`

Keep the dev terminal open while using the site. Stop it with Ctrl+C.

Local migration (local database only):

```powershell
npm run db:migrate:local
```

The command contains `--local`. It does not migrate Cloudflare.

## 4. Known booking issue already identified and fixed in the branch

The Astro configuration uses `trailingSlash: 'always'`. The booking and staff UI previously called API routes without a final slash, such as `/api/public/availability`. Astro development returned an HTML warning page for the non-canonical API URL; the React code tried to parse that page as JSON and failed with `Unexpected token '<'`.

The development branch fixes the API URLs to use the trailing slash and adds a shared JSON response parser plus a unit test. Do not revert those changes.

The public calendar now requests the current date plus 45 days ahead (46 calendar dates total). The UI must not advertise dates beyond the populated booking horizon.

The user has not yet confirmed that the corrected branch has been pulled to the laptop or browser-tested. Do not claim that the customer flow is fully tested.

## 5. Cloudflare resource separation

Repository configuration records the following resources:

| Use | Resource | ID |
|---|---|---|
| Production D1 | `hsr_green_energy_prod` | `2167157a-4c00-4063-b183-c0a5bd12ed5d` |
| Preview D1 | `hsr_green_energy_preview` | `3220c6e5-64ff-4874-9d5d-0e237f5af9ad` |
| Production R2 | `hsr-prod` | binding `EVIDENCE_BUCKET` |

These are configuration records. Verify actual Cloudflare account state before deployment or data changes.

### Safe Cloudflare inspection

Authenticate from the user's laptop, then confirm the connected account:

```powershell
npx wrangler whoami
```

If not authenticated, run `npx wrangler login` and complete the browser sign-in.

Inspect the Preview migration history only:

```powershell
npx wrangler d1 migrations list PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
```

Inspect Preview schedule hours and future active bookings using the read-only commands in `docs/deployment.md`. Do not apply migration 0005 if:
- Preview has active bookings today or in the future.
- Open weekdays have different opening/closing/break times.
- The migration history/schema differs from what the checked-in migration files expect.

Migration 0005 deliberately aborts when active bookings exist. It also currently assumes the open weekdays share one schedule template. Do not bypass its preflight or edit the remote database manually to get past it.

Only after inspecting the Preview state and reviewing the results should the Preview migration be run:

```powershell
npm run db:migrate:preview
```

This command uses `--remote` with the separate Preview-only configuration. It changes Cloudflare Preview D1.

Then verify again:

```powershell
npx wrangler d1 migrations list PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
```

### Preview Worker deployment

After the local code checks pass and Preview D1 is prepared:

```powershell
npm run build
npx wrangler preview
```

This creates/updates a Worker Preview for the current Git branch using the `previews` configuration in `wrangler.jsonc`. Preview must use `hsr_green_energy_preview`, never Production D1. Cloudflare Worker Previews are separate from Production settings; verify the resulting Preview URL and bindings in the Cloudflare dashboard.

Do not add the Production R2 bucket to Preview. Screenshot upload is intentionally unavailable in Preview unless a separate test R2 bucket is created and bound.

### Production — prohibited until explicit approval

Do not run either of these at this stage:

```powershell
npm run db:migrate:remote
npx wrangler deploy
```

The first applies remote migrations to the top-level Production D1 binding. The second deploys Production Worker code. Neither is needed to test this PR.

## Antigravity connection to Cloudflare

The workspace contains `.agents/mcp_config.json`, which points to the official Cloudflare API MCP endpoint using Antigravity's remote Streamable HTTP format. Open the existing repository folder in Antigravity, open MCP Servers, and authenticate the `cloudflare-api` server through the Cloudflare OAuth flow. The MCP OAuth login is separate from Wrangler CLI login.

There are two independent ways for Antigravity to interact with Cloudflare:
1. **Wrangler CLI in the Antigravity terminal.** The Windows user's successful `npx wrangler login` is stored in the local Wrangler profile. The Antigravity terminal runs as the same Windows user and should be able to use it. Verify inside Antigravity using `npx wrangler whoami`. Do not copy Wrangler credential files into the repository.
2. **Cloudflare API MCP.** Antigravity connects to Cloudflare's API using the workspace config. Authenticate in Antigravity, then verify the server status is connected and ask it to list/read the existing `hsr` Worker and the two D1 resources. Start read-only.

Do not assume either connection works merely because a config file exists. Confirm both from the Antigravity application itself before relying on it.

Cloudflare API MCP exposes powerful account-management operations. Keep Antigravity's tool permissions in Ask mode. The agent must inspect first and request approval before remote mutations. Do not grant broad write access merely to inspect settings. Do not place an API token in `.agents/mcp_config.json`; the config contains only the endpoint and uses OAuth.

## 6. Cloudflare Access and staff portal

The following values are placeholders in both Production and Preview configuration:
- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUDIENCE`
- `APP_BASE_URL`

Owner and receptionist APIs require a valid Cloudflare Access JWT and a matching active `staff_users` record. Do not bypass authentication, fabricate role headers, or hard-code user emails.

Configure a Preview Access application/policy for staff routes and the exact corresponding Preview runtime values before testing staff functionality. Production Access must be separately configured. Keep Access credentials/AUD values out of Git.

## 7. Business configuration still required

The software is not launch-ready just because it builds. The following values remain owner-supplied:
- Actual legal/public business name, city, address, phone, WhatsApp, email and map link.
- Actual opening days/hours, breaks, 15/20-minute work interval and whether the extra hour is staff-only or public.
- All 12 cylinder-count prices and non-zero advance amounts for cylinder counts the owner wants to enable for online booking.
- Correct merchant UPI VPA and payee name.
- Actual station photographs.
- Approved service descriptions and any PESO/recognition details only after supporting evidence is verified.
- Cloudflare Access identity and owner/receptionist role.
- Applicable tax/SAC treatment; the software's 18% GST value is a configurable project setting, not a legal determination.

The current `services`, `about`, `contact` and `how-it-works` page text is seeded as `SETUP_REQUIRED` and therefore displays an intentional owner-configuration message. The homepage image is a placeholder. Do not invent missing business facts.

All online advance amounts are initially NULL. Until they are configured, public booking creation should remain unavailable for those cylinder counts. This is intentional fail-safe behaviour, not a bug.

## 8. Booking cylinder-count specification to reconcile

The current code, schema, migration and Owner Settings model support public cylinder counts **1–12**, with a truck default of 4. A later user discussion on 12 November described a revised customer dropdown with **1–6 plus a “more than 6” contact option**, while preserving the truck default of 4. That newer requirement has not yet been implemented or reconciled with the existing database/pricing model.

Do not silently assume either limit. Before changing the form, ask the user in the Antigravity working session to confirm whether the public flow should be 1–6 plus contact for 7+, or 1–12 plus contact for 13+. If changed, update the entire feature consistently: migration/data model as necessary, Owner Settings prices and availability flags, public API validation, shared booking engine, admin/reception flow, Hindi and English labels, tests and documentation. Do not only hide options in the browser.

## 9. Verification required before PR #1 can be made ready

At minimum:
1. Local browser test of English and Hindi pages.
2. Browser test of public API calls; confirm JSON responses and no HTML/JSON parsing errors.
3. Customer booking journey: date, vehicle class, make/model, 1–12 CNG storage cylinders, truck default 4, available consecutive times, details and booking hold.
4. Reception flow using authenticated Preview Access; confirm manual booking and web booking share the same D1 capacity ledger.
5. Owner flow: edit schedule, prices, advance amounts and content; verify all changes persist.
6. Verify that 15/20-minute intervals, public/staff-only extended hour and overlapping booking protection work.
7. Verify UTR submission and receptionist payment verification; test R2 only if a separate Preview bucket exists.
8. Check desktop and mobile layouts and keyboard accessibility.
9. Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and meaningful browser tests.
10. Review CI, Preview logs and the full PR diff.

PR #1 must remain DRAFT until the user has reviewed the live Preview and approved making it ready for review.
