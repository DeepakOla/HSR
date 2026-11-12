# Architecture

- **Runtime**: Astro server output on Cloudflare Workers adapter.
- **Data**: Cloudflare D1 for settings/content/schedule/bookings/payments/register/audit/idempotency.
- **Optional storage**: private Cloudflare R2 Standard for payment evidence objects only.
- **Client islands**: React used only in booking wizard.
- **Public pages**: server-rendered from D1 so owner updates appear without rebuild.
- **APIs**: same-origin `/api/*` endpoints for public booking and admin operations.
