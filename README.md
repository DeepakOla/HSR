# HSR Green Energy

Bilingual CNG cylinder testing website and booking platform. Astro + React islands + Cloudflare Workers + D1. The public website, booking wizard and staff portals are separate experiences backed by one D1 booking ledger.

## Local development

Requirements: Node.js 22 LTS and Git.

```powershell
git clone https://github.com/DeepakOla/HSR.git
cd HSR
git switch copilot/build-cng-cylinder-hydro-testing-website
npm ci
```

Create the D1 database and let Wrangler write its real ID into `wrangler.jsonc`:

```powershell
npx wrangler login
npx wrangler d1 create hsr_green_energy_prod --binding DB --update-config
```

Apply the schema to your local development database and run the site:

```powershell
npx wrangler d1 migrations apply hsr_green_energy_prod --local
npm run dev
```

The local Admin pages require a Cloudflare Access identity and a matching `staff_users` row. Do not bypass this by sending made-up role headers.

## Checks

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

## Deploy to Cloudflare Workers Free

Follow [docs/deployment.md](docs/deployment.md) in order. Do not deploy while `database_id` is still `SETUP_REQUIRED`.

## Business setup required before public launch

- Confirm legal business name, city, full address, map pin, phone and WhatsApp.
- Add genuine station photographs.
- Verify PESO/station approval details before publishing any government-authorisation claims.
- Confirm actual services and operating days/hours.
- Confirm merchant UPI VPA/payee name and advance policy.
- Configure Cloudflare Access and add owner/receptionist identities to D1.
- R2 is optional. Without it, screenshot upload is disabled; UTR submission and WhatsApp fallback remain available.

## Important invariants

- English and Hindi are separate route trees.
- Homepage is a business website, not a booking form.
- The booking wizard is a separate sequential journey.
- All booking sources share one D1 ledger.
- Capacity is checked against both slot and daily limits by the server.
- UPI QR/link and a screenshot never mean payment is verified.
- Only unpaid HELD bookings expire automatically. Evidence-submitted bookings remain reserved pending receptionist review.
- Historical booking prices and slot details are snapshots.
- Unknown business credentials must remain SETUP_REQUIRED; never invent them.
