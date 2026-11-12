# HSR Green Energy

Bilingual CNG cylinder testing website and booking platform. Astro + React islands + Cloudflare Workers + D1. The public website, booking wizard and staff portals are separate experiences backed by one D1 booking ledger.

## Local development

Requirements: Node.js 22 or newer and Git.

```powershell
git clone https://github.com/DeepakOla/HSR.git
cd HSR
git switch copilot/build-cng-cylinder-hydro-testing-website
npm ci
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

## Booking model

The customer journey is: appointment date, vehicle type and make/model, number of CNG gas cylinders, available start time, then customer details.

- Vehicle choices: Car, Taxi, Tempo, Van, LCV, Truck, Bus and Other.
- Truck preselects four CNG gas cylinders; the customer can change the count.
- Standard online choices are 1–12 CNG gas cylinders. More than 12 directs the customer to contact the centre; it is not a self-service online booking.
- One cylinder reserves one consecutive work unit. The owner selects a 15- or 20-minute interval, so a multi-cylinder booking reserves a continuous run of work units.
- An optional extra operating hour can be staff-only or visible to online customers.
- Public availability hides staff-only units. Reception uses a role-protected availability endpoint and the same allocation engine.
- Website, phone, WhatsApp and walk-in bookings share one D1 ledger and capacity allocator.

## Pricing model

The initial software seed is ₹2,500 base service price per cylinder, with an 18% GST calculation as specified for this project. Each cylinder-count price from 1 to 12 can be edited independently in Owner Settings.

These are configurable business defaults, not a government-prescribed tariff. The software's 18% setting is not a legal determination of the correct SAC or tax treatment; verify the applicable classification before live billing.

Advance amounts are intentionally left unset in the initial seed. The owner must configure the advance for each cylinder count before that count is enabled for online UPI booking. Reception can still create phone, WhatsApp and walk-in bookings. A blank advance must not be interpreted as a verified payment.

## Deploy to Cloudflare Workers Free

Follow [docs/deployment.md](docs/deployment.md) in order. Do not deploy while `database_id` is still `SETUP_REQUIRED`.

## Business setup required before public launch

- Confirm legal business name, city, full address, map pin, phone and WhatsApp.
- Add genuine station photographs.
- Verify PESO/station approval details before publishing any government-authorisation claims.
- Confirm actual services and operating days/hours.
- Review all 12 cylinder-count prices and confirm the applicable GST/SAC treatment.
- Configure advance amounts and verify the merchant UPI VPA/payee name.
- Configure Cloudflare Access and add owner/receptionist identities to D1.
- R2 is optional. Without it, screenshot upload is disabled; UTR submission and WhatsApp fallback remain available.

## Important invariants

- English and Hindi are separate route trees.
- Homepage is a business website, not a booking form.
- The booking wizard is a separate sequential journey.
- Public booking requests cannot impersonate staff booking sources.
- Staff-only appointment units are available only through authenticated admin routes.
- Each active booking reserves a consecutive set of cylinder work units; unique allocation constraints prevent overlapping reservations.
- UPI QR/link and a screenshot never mean payment is verified.
- Only unpaid HELD bookings expire automatically. Evidence-submitted bookings remain reserved pending receptionist review.
- Historical booking prices, vehicle descriptions, slot times and schedule versions are snapshots.
- Unknown business credentials must remain SETUP_REQUIRED; never invent them.
