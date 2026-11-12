# Deployment (Cloudflare Workers)

1. Configure `wrangler.jsonc` with environment-specific D1/R2 bindings.
2. Set env vars from `.env.example` values.
3. Run `npm run build`.
4. Deploy Worker with Wrangler.
5. Configure cron trigger to call `/api/admin/maintenance/expire-holds` with maintenance token.

## Free-tier guardrails

- Workers Free: 100k req/day, 10ms CPU per invocation.
- D1 Free: 5M reads/day, 100k writes/day, 500MB/db, 5GB account total.
- R2 Standard free allowances apply but overages can bill; app enforces configurable evidence budget and upload size limits.
- Workers Builds Free limits apply (3,000 min/month etc.).

Verify limits against current Cloudflare docs before production.
