# Cloudflare Workers deployment

This repository uses one Cloudflare Worker with Astro server rendering, static assets, same-origin APIs, D1 and an optional R2 binding. It is not a Cloudflare Pages deployment.

## 1. Required local tools

Install Node.js 22 LTS and Git. In PowerShell:

```powershell
git clone https://github.com/DeepakOla/HSR.git
cd HSR
git switch copilot/build-cng-cylinder-hydro-testing-website
npm ci
npx wrangler login
```

## 2. Create the production D1 database

Run:

```powershell
npx wrangler d1 create hsr_green_energy_prod --binding DB --update-config
```

Wrangler should create the database and update `wrangler.jsonc` with its real database UUID. Open `wrangler.jsonc` and verify:
- `d1_databases[0].binding` is `DB`.
- `database_name` is `hsr_green_energy_prod`.
- `database_id` is a real UUID, not `SETUP_REQUIRED`.
- `migrations_dir` is `migrations`.

Do not paste the database ID into application source files or a public message. The ID is not a password, but avoid sharing account configuration unnecessarily.

## 3. Apply D1 migrations

First inspect the migration list:

```powershell
npx wrangler d1 migrations list hsr_green_energy_prod --remote
```

Apply migrations:

```powershell
npx wrangler d1 migrations apply hsr_green_energy_prod --remote
```

Wrangler applies versioned SQL migrations. Never run a destructive reset on production.

## 4. Set up Cloudflare Access and the first owner

Create a Cloudflare Access self-hosted application for the deployed Worker hostname. Create policies for the exact owner and receptionist email addresses. Keep the application protected.

Copy the Access Team domain and the Access application's AUD (Application Audience) tag. Set these values in the Worker variables:
- `ACCESS_TEAM_DOMAIN`: e.g. `your-team.cloudflareaccess.com` (domain only or https URL).
- `ACCESS_AUDIENCE`: the exact AUD tag from the Access application.

The Worker verifies the `cf-access-jwt-assertion` signature, issuer, audience and time claims, then looks up the role from D1. Request headers such as `x-staff-role` are not trusted.

After migrations, insert the owner email (replace the placeholder with the exact email protected by Access):

```powershell
npx wrangler d1 execute hsr_green_energy_prod --remote --command "INSERT INTO staff_users(email, role, is_active) VALUES('OWNER_EMAIL_FROM_ACCESS', 'OWNER', 1);"
```

Add receptionists similarly with role `RECEPTIONIST`. Do not add a user until their email is protected by the Access policy.

## 5. Optional R2 payment screenshot storage

The site works without R2: customers can submit a full UTR/reference or use WhatsApp. Website screenshot upload stays unavailable until a private R2 bucket is configured.

If you choose to enable R2:
1. Review Cloudflare R2 billing and free allowances first. R2 requires activating the R2 subscription/checkout; usage above free allowances can be billed.
2. Create a Standard bucket:

```powershell
npx wrangler r2 bucket create hsr-green-energy-evidence
```

3. Add this binding to the top-level `r2_buckets` array in `wrangler.jsonc`:

```json
{
  "binding": "EVIDENCE_BUCKET",
  "bucket_name": "hsr-green-energy-evidence"
}
```

4. Deploy again and verify the bucket is private (do not enable public access).
5. Set `business_settings.r2_enabled = 1` only after upload/view routes and retention controls have been tested.

Do not store image Base64 data in D1. Do not add an R2 binding if you have not created the bucket.

## 6. Local checks and manual deployment

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npx wrangler deploy
```

The first deploy will create a `workers.dev` URL unless a custom domain is configured. Keep the Worker in the Free plan and monitor usage. Free quotas are not unlimited.

## 7. Connect GitHub to Cloudflare Workers Builds

In Cloudflare Dashboard:
1. Open Workers & Pages and create/connect a Worker using GitHub.
2. Select repository `DeepakOla/HSR`.
3. Select production branch `main` after the reviewed PR is merged.
4. Build command: `npm run build`.
5. Deploy command: `npx wrangler deploy`.
6. Build variables/secrets: configure only required environment values in Cloudflare, not in GitHub files.
7. Enable preview builds for pull requests if desired; do not promote a preview branch to production.

Do not select a legacy Pages static-site preset or use `wrangler pages deploy`. This repository is configured as a Workers application.

## 8. Scheduled jobs: hold expiry and availability horizon

`wrangler.jsonc` configures two UTC Cron Triggers. Every five minutes, the Worker expires only unpaid `HELD` + `ADVANCE_PENDING` reservations. Every day at 18:35 UTC (00:05 India time), it extends daily slot snapshots to 45 days ahead using the active schedule version.

Payment-evidence-submitted `PENDING_VERIFICATION` reservations are not automatically released. The daily extension uses `INSERT OR IGNORE` and the schedule version's activation date, so it does not overwrite existing bookings or project new hours backwards. Do not manually create a public maintenance-token endpoint.

## 9. If deployment still fails

Do not guess at the cause. Open Cloudflare > Workers & Pages > your Worker > Builds/Deployments, open the failed build, and copy the complete error starting at the first red/error line. The most common initial setup blocker in this repository is a missing D1 UUID in `wrangler.jsonc`; the create command above should replace it. Another possible issue is a missing Cloudflare Access audience/domain configuration for admin use, which is a runtime access issue rather than a Worker build failure.

## Free-tier controls

Use Workers Free and D1 Free limits; keep queries indexed and uploads capped. Optional R2 Standard has monthly free allowances but can incur overage charges. Cloudflare prices and quotas can change; verify current Dashboard billing before enabling optional storage.
