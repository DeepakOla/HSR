# SETUP_REQUIRED checklist

Production is not ready until the owner configures and verifies:

- Business legal name and Hindi/English public names
- City, address, map pin, contact phone, WhatsApp number and email
- Working days, holidays, operating hours, 15- or 20-minute interval and optional additional hour
- Whether the additional hour is staff-only or visible to customers
- All 12 cylinder-count base prices and online-booking availability flags
- Advance amount for each cylinder count enabled for online UPI booking
- Applicable SAC and GST classification; the software's 18% rate is a project setting, not a legal tax determination
- Merchant UPI VPA and payee name, verified with a real low-value test before accepting bookings
- Verified station-recognition credentials and proof before publishing approval claims
- Staff identities and roles via Cloudflare Access
- Evidence retention policy and R2 configuration, if screenshot upload is enabled
- Test a public booking and a phone/walk-in booking against the same slot to confirm that overlapping work units cannot both be reserved

The standard public booking flow offers 1–12 CNG storage cylinders. More than 12 must be referred to the centre and assessed separately; do not create an unverified public price.
