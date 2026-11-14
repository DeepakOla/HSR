# Architecture

- **Runtime**: Astro server output on the Cloudflare Workers adapter.
- **Data**: Cloudflare D1 for business settings/content, cylinder-count price rows, schedule versions, daily slot snapshots, customer/vehicle records, bookings, allocated work units, payment evidence metadata, cylinder register, audit events and idempotency keys.
- **Optional storage**: private Cloudflare R2 Standard for payment evidence objects only.
- **Client islands**: React is used for the multi-step public booking wizard and staff owner/reception applications.
- **Public pages**: server-rendered from D1 so owner updates appear without rebuild.
- **Public APIs**: public vehicle-price and availability reads plus website booking/payment-evidence actions.
- **Staff APIs**: owner/reception routes require a verified Cloudflare Access identity and a matching D1 staff role. The staff availability route can include staff-only extra-hour units; the public route cannot.
- **Pricing**: one active price row per standard cylinder count (1–12). Prices are stored in integer paise; the shared price helper calculates the project-configured 18% GST amount. Owner changes affect new bookings only.
- **Capacity**: one 15- or 20-minute work unit represents one cylinder. The booking engine selects a consecutive run for the requested cylinder count. D1 allocation rows have a unique constraint per work unit, and a database trigger checks the run again at insert time.
- **Schedule versioning**: each schedule change applies from a future effective date; prior bookings retain their slot and price snapshots.
- **Payment**: direct UPI URI/QR, UTR/reference submission and staff verification. No payment gateway is integrated. A QR or customer screenshot is not proof of settled payment.
