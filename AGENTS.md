# Agent Invariants

## Booking and capacity

- Active capacity states are `HELD`, `PENDING_VERIFICATION`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`.
- Hold expiry only auto-expires `HELD` + `ADVANCE_PENDING` bookings.
- Do not auto-release bookings after evidence submission.
- Use atomic DB-guarded writes for hold creation.
- Preserve snapshot pricing, slot labels, capacity and config version on each booking.

## Payment and evidence

- UPI link/QR does not verify payment.
- Evidence and UTR set booking to `PENDING_VERIFICATION`/`EVIDENCE_SUBMITTED`.
- R2 is private and optional; when unavailable, website screenshot upload must be disabled.

## Security

- Protect admin pages and APIs server-side.
- Never trust role or pricing from browser.
- Public APIs must not leak customer PII.

## Testing commands

- `npm run test`
- `npm run typecheck`
- `npm run build`
