import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { validateVehicleRegistration } from '../src/lib/vehicle-registration';
import { VEHICLE_OPTIONS, inr } from '../src/lib/booking-wizard-helpers';

describe('Website Redesign & Inline Booking Verification', () => {
  it('verifies InlineBooking component file exists and exports properly', async () => {
    const inlineContent = await fs.readFile('src/components/booking/InlineBooking.tsx', 'utf-8');
    expect(inlineContent).toContain('export default function InlineBooking');
    expect(inlineContent).toContain('One Vehicle');
    expect(inlineContent).toContain('Multiple Vehicles / Fleets');
    expect(inlineContent).toContain('500.00');
  });

  it('verifies HomePage.astro implements the 7 Precision Hydro Test sections', async () => {
    const homeContent = await fs.readFile('src/components/HomePage.astro', 'utf-8');
    expect(homeContent).toContain('id="hero"');
    expect(homeContent).toContain('id="refused-cng"');
    expect(homeContent).toContain('InlineBooking');
    expect(homeContent).toContain('id="pricing"');
    expect(homeContent).toContain('id="process"');
    expect(homeContent).toContain('id="standards"');
    expect(homeContent).toContain('id="location"');
  });

  it('verifies zero prototype mockup leakage in production components', async () => {
    const files = [
      'src/components/HomePage.astro',
      'src/layouts/BaseLayout.astro',
      'src/components/booking/InlineBooking.tsx',
      'src/components/ContentPage.astro',
    ];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      expect(content).not.toContain('KA-01');
      expect(content).not.toContain('KA-03');
      expect(content).not.toContain('KA-51');
      expect(content).not.toContain('PESO LAB #941');
      expect(content).not.toContain('PESO #941');
      expect(content).not.toContain('Bengaluru');
      expect(content).not.toContain('Bangalore');
    }
  });

  it('verifies BaseLayout.astro includes mobile navigation toggle and accessible drawer', async () => {
    const layout = await fs.readFile('src/layouts/BaseLayout.astro', 'utf-8');
    expect(layout).toContain('id="mobile-nav-toggle"');
    expect(layout).toContain('id="mobile-nav-drawer"');
    expect(layout).toContain('hamburger-bar');
    expect(layout).toContain('Staff / Admin Login');
    expect(layout).toContain('/admin/login/');
  });

  it('verifies flat ₹500 advance formatting helper', () => {
    expect(inr(50000)).toBe('₹500');
    expect(inr(200000)).toBe('₹2,000');
  });

  it('verifies vehicle validation handles Haryana and BH series', () => {
    expect(VEHICLE_OPTIONS.length).toBeGreaterThan(0);
    expect(validateVehicleRegistration('HR36AB1234').valid).toBe(true);
    expect(validateVehicleRegistration('22BH1234AA').valid).toBe(true);
    expect(validateVehicleRegistration('INVALID').valid).toBe(false);
  });
});
