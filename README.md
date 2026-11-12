# HSR Green Energy - CNG Cylinder Hydro Testing Platform

Astro + TypeScript + Cloudflare Workers app with bilingual public site (`/en`, `/hi`), booking wizard, D1-backed capacity ledger, and role-protected admin APIs.

## Quick start

```bash
npm install --legacy-peer-deps
npm run dev
```

## Core commands

- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

## Cloudflare setup

1. Create separate D1 databases for dev/preview/prod.
2. Apply migrations from `/migrations`.
3. Configure `wrangler.jsonc` bindings and env vars.
4. Optional: configure private R2 Standard bucket for payment evidence.
5. Configure Cloudflare Access and map staff emails to roles in D1.

## Important

- Unknown business details are seeded as `SETUP_REQUIRED`.
- No PESO/VAHAN approval claims are published by default.
- Upload fallback: if R2 is disabled/unavailable, UTR + WhatsApp flow remains available.
- Currency is stored in integer paise.
- Capacity is shared across WEB, PHONE, WHATSAPP and WALKIN sources.

## Regulatory source note

Expiry reminder logic is based on a 3-year periodic test cycle per Rule 35 references noted in `docs/regulatory-sources.md`.
