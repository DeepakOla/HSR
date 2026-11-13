# HSR CNG Platform — Developer & Agent Onboarding

## 1. System & Runtime Environment

- **Required Node.js Executable**: `C:\Program Files\nodejs\node.exe` (Node.js v24.22.3, npm v11.19.1).
- **Important**: Other installations are managed by NVM (`C:\nvm4w\nodejs\node.exe` v20.19.4) and **MUST NOT** be used.
- Node.js is already installed. Do not attempt to install, reinstall, or change Node versions.
- Terminal sessions resolve `C:\Program Files\nodejs` first via the configured PowerShell profile (`$PROFILE`).
- Verify anytime with:
  ```powershell
  where.exe node
  node --version
  npm --version
  ```
  Expected first entry: `C:\Program Files\nodejs\node.exe` returning `v24.22.3`.

---

## 2. Business & Brand Identity Invariants

1. **Business Name**:
   - The business name is **NOT finalised**. Do not hardcode "HSR Green Energy" as a permanent brand name.
   - The default display name is **HSR** until changed.
   - Must remain fully configurable by the Owner in `business_settings` (English & Hindi).
2. **Location / Operational City**:
   - The final location is **NOT finalised**.
   - Default city value is set to **Rewari** in settings, fully editable by the Owner.
   - Any external regulatory/accreditation claims remain `SETUP_REQUIRED` until formally verified.
3. **Contact Phone & WhatsApp**:
   - Default contact number is **+91 9910055355** until updated by the Owner/Admin in settings.
4. **Owner / Admin Identity**:
   - Owner email for Cloudflare Access and `staff_users` table: **`kumardeepakola@gmail.com`**.
   - Role: `OWNER`.
   - Never bypass Cloudflare Access JWT validation or invent dummy roles.

---

## 3. Commercial & Booking Rules

1. **Advance Amount**:
   - **₹500 flat per booking** (temporary, Owner-editable default in `business_settings.flat_advance_paise = 50000`).
   - Single source of truth for online bookings: flat advance per booking, regardless of cylinder count.
   - Preserves any deliberately configured Owner amount.
   - Balance payable = Total amount - ₹500.
2. **Pricing Structure**:
   - Base service charge: ₹2,500 per CNG cylinder.
   - Configurable GST: 18% calculation (`FIXED_GST_RATE_BPS = 1800`).
   - 1 cylinder = ₹2,500 + ₹450 GST = ₹2,950 total (₹500 advance, ₹2,450 balance).
   - 2 cylinders = ₹5,000 + ₹900 GST = ₹5,900 total (₹500 advance, ₹5,400 balance).
   - 4 cylinders = ₹10,000 + ₹1,800 GST = ₹11,800 total (₹500 advance, ₹11,300 balance).
3. **Cylinder Selection & Limits**:
   - **Public online booking dropdown**: 1, 2, 3, 4, 5, 6 cylinders, plus "More than 6".
   - "More than 6" halts self-service booking and provides Phone/WhatsApp contact card (+91 9910055355).
   - Server-side public API strictly rejects `cylinderCount > 6` for `source === 'WEB'`.
   - Internal reception desk retains 1–12 cylinder booking capability.
4. **Vehicle Selection**:
   - Dropdown: Car, Taxi, Tempo, Van, LCV, Truck, Bus, Other.
   - Optional vehicle make/model field.
   - Selecting **Truck** automatically preselects **4 CNG cylinders** (editable by user).
5. **Payment Gating**:
   - Pre-write fail-closed check: No `HELD` booking is created if UPI VPA (`vpa_id`) or payee name (`vpa_payee_name`) are unconfigured or `SETUP_REQUIRED`.
   - Routes user cleanly to Phone/WhatsApp booking if online payment is unconfigured.

---

## 4. UI/UX & Design Direction

- **Selected Design Direction**: **Direction A — Professional Industrial Trust**.
- Aesthetic: **Industrial engineering identity**, NOT green-energy/eco/environmental branding.
- Visuals: Clean, high-contrast, robust typography (Poppins/Open Sans), disciplined navy/industrial palette with amber/orange action highlights, zero frivolous gradients or AI template tells.
- Brand name, logo, and color identity remain adjustable; visual concepts must be reviewed before final lock.
- **Images**: Stock facility imagery is marked clearly as placeholder until genuine HSR facility photos are supplied. Real facility images remain pending.
- **Bilingual Content**: Full English and Hindi support across public pages and the Owner Content CMS.

---

## 5. Verification Commands

```powershell
npm run test        # Runs Vitest unit & integration suites
npm run typecheck   # Runs Astro TypeScript diagnostics
npm run build       # Validates production build
```
