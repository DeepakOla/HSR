# Security controls

- Admin pages and APIs require a valid Cloudflare Access JWT in `cf-access-jwt-assertion`.
- The Worker verifies RS256 signature using Cloudflare Access public keys and checks issuer, audience, expiry and not-before claims.
- The email in the verified JWT is mapped to an active `staff_users` row. Role is never accepted from a browser-supplied header.
- Public booking status requires booking code and a high-entropy status token; only its hash is stored.
- Payment evidence submission requires the booking status token and an active, unexpired hold.
- R2 evidence must remain private and is fetched only through an authorised staff route.
- Origin checks and endpoint rate limits protect state-changing public APIs.
- UPI link, QR and uploaded screenshot are not payment verification. Receptionist verification is required.
- Only unpaid HELD reservations expire. Evidence-submitted reservations remain held pending review.
- No secrets, Access AUD values, real UPI credentials or customer data belong in Git.
- This is not a completed security certification. Perform a full penetration and integration review before live customer use.
