# Cloudflare Workers deployment

This repository uses one Cloudflare Worker named `hsr` with Astro server rendering, static assets, same-origin APIs, production D1, isolated Preview D1, and private production R2 storage. It is not a Cloudflare Pages deployment.

## 1. Cloudflare resources already created

The Cloudflare account already contains these resources. Do not create duplicates:

| Purpose | Resource | ID / binding |
|---|---|---|
| Production database | `hsr_green_energy_prod` | `2167157a-4c00-4063-b183-c0a5bd12ed5d` |
| Preview database | `hsr_green_energy_preview` | `3220c6e5-64ff-4874-9d5d-0e237f5af9ad` |
| Production evidence bucket | `hsr-prod` | `EVIDENCE_BUCKET` |

These IDs and bindings are already recorded in `wrangler.jsonc`. That file is the version-controlled configuration source of truth.

The production Worker is named `hsr`, matching the existing Cloudflare Worker. Production uses `hsr_green_energy_prod` and the private `hsr-prod` R2 bucket. Worker Previews use the separate `hsr_green_energy_preview` D1 database. The production R2 bucket is deliberately NOT bound to Previews; screenshot uploads remain unavailable in Previews until a separate test bucket is provisioned.

## 2. Required local tools

Install Node.js 22 LTS and Git. Open Windows PowerShell:

```powershell
git clone https://github.com/DeepakOla/HSR.git
cd HSR
git switch copilot/build-cng-cylinder-hydro-testing-website
npm ci
npx wrangler login
```

If the repository is already cloned, use `cd` into the existing repository instead of cloning it again.

## 3. Inspect and apply the Preview D1 migrations first

Inspect the Preview database migration state:

```powershell
npx wrangler d1 migrations list hsr_green_energy_preview --remote
```

Apply any pending migrations:

```powershell
npm run db:migrate:preview
```

Verify again:

```powershell
npx wrangler d1 migrations list hsr_green_energy_preview --remote
```

Do not run a destructive reset. The Preview database is isolated from production and is used for branch testing.

## 4. Inspect and apply production D1 migrations

Before applying, inspect production migration state:

```powershell
npx wrangler d1 migrations list hsr_green_energy_prod --remote
```

When ready to initialize the production schema, apply pending migrations:

```powershell
npm run db:migrate:remote
```

Verify again:

```powershell
npx wrangler d1 migrations list hsr_green_energy_prod --remote
```

Never run a destructive reset on production. Do not copy Preview/test bookings into production.

## 5. Production R2 evidence storage

The production bucket `hsr-prod` is already bound as `EVIDENCE_BUCKET` in `wrangler.jsonc`.

Before enabling screenshots:
1. Confirm the bucket is private (no public bucket/domain access).
2. Confirm it uses the Standard storage class, not Infrequent Access.
3. Confirm the Worker production binding is present after deployment.
4. Keep the per-file upload limit at 1 MiB unless a reviewed change is made.
5. Keep `business_settings.r2_enabled = 0` until the upload and authenticated evidence-view flows have been tested end-to-end.

R2 screenshot upload must not be enabled merely because the bucket exists. Website UTR/reference entry and WhatsApp fallback remain available if upload is disabled.

Previews deliberately have no R2 bucket binding. Do not add `hsr-prod` to the `previews.r2_buckets` block: two Previews using the same bucket name share objects. A separate test bucket must be created before enabling screenshot upload in Previews.

Do not store Base64 image data in D1.

## 6. Cloudflare Workers Builds settings

In Cloudflare Dashboard:
1. Open **Workers & Pages** > **hsr** > **Settings** > **Builds**.
2. Set **Production branch** to `main`.
3. Enable **Preview builds**.
4. Production:
   - Build command: `npm ci && npm run build`
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`
   - Build token: select the existing `hsr build token`
   - Build variables/secrets: none required for compilation.
5. Previews Base:
   - Build command: `npm ci && npm run build`
   - Preview command: `npx wrangler preview`
   - Root directory: `/`
   - Build token: select the existing `hsr build token`
   - Build variables/secrets: none required for compilation.

Do not put `npm ci`, `npm run build` and `npx wrangler deploy` together in one Deploy command. Workers Builds runs the Build command first and the Deploy command second. Non-production branches use the Preview command instead of the production Deploy command.

The Wrangler `previews` block is configured in `wrangler.jsonc`. It contains the Preview D1 binding and fail-closed placeholder Access values; it intentionally does not bind production R2.

## 7. Cloudflare Access and first owner

Administrative access must remain protected by Cloudflare Access. The application checks the Cloudflare Access JWT signature, issuer, audience, and expiration, then looks up the email's active role in D1. Do not bypass this by sending role headers.

The following runtime values are still placeholders in `wrangler.jsonc` and must be replaced/configured with the actual Cloudflare Access application values before owner/receptionist login can work:

- `ACCESS_TEAM_DOMAIN`: the Access team domain, e.g. `your-team.cloudflareaccess.com`.
- `ACCESS_AUDIENCE`: the exact AUD tag from the Access application.

These are runtime settings, not Workers Builds variables. Configure production and Preview Access separately. Previews are public by default unless protected; apply an Access policy that protects the Preview hostname(s) before sharing Preview URLs.

After production migrations and Access are configured, add the first owner using the exact email allowed by Access:

```powershell
npx wrangler d1 execute hsr_green_energy_prod --remote --command "INSERT INTO staff_users(email, role, is_active) VALUES('OWNER_EMAIL_FROM_ACCESS', 'OWNER', 1);"
```

Add receptionists with role `RECEPTIONIST`. Use the exact email address returned by the verified Access JWT.

Do not put Access credentials or secrets in Git.

## 8. Local checks and manual deployment

Run the checks before deployment:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

For a manual production deployment only after PR review and merge to `main`:

```powershell
npx wrangler deploy
```

Do not manually deploy the development branch to production. Cloudflare Workers Builds should deploy `main` as production and use `npx wrangler preview` for other branches.

## 9. Scheduled jobs

`wrangler.jsonc` configures two UTC Cron Triggers. Every five minutes, the Worker expires only unpaid `HELD` + `ADVANCE_PENDING` reservations. Every day at 18:35 UTC (00:05 India time), it extends daily slot snapshots to 45 days ahead using the active schedule version.

Payment-evidence-submitted `PENDING_VERIFICATION` reservations are not automatically released. Do not manually create a public maintenance-token endpoint.

## 10. If deployment fails

Do not guess at the cause. Open Cloudflare > Workers & Pages > `hsr` > Builds/Deployments, open the failed build, and inspect the first red/error line and the complete error context.

A failed Preview deployment must not be fixed by pointing the Preview at the production D1 or R2 resource. Keep resource isolation intact.
