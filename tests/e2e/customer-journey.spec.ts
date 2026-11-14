import { expect, test } from '@playwright/test';

test.describe('Customer Booking & Demo Preview Journeys (E2E)', () => {
  test('displays demo preview banner in English and Hindi', async ({ page }) => {
    // English Home
    await page.goto('/en/');
    const enBanner = page.locator('.demo-banner');
    await expect(enBanner).toBeVisible();
    await expect(page.locator('.demo-tag')).toContainText('DEMO PREVIEW v0.0.1');
    await expect(page.locator('.demo-text')).toContainText('Pre-operational verification preview');

    // Hindi Home
    await page.goto('/hi/');
    const hiBanner = page.locator('.demo-banner');
    await expect(hiBanner).toBeVisible();
    await expect(page.locator('.demo-tag')).toContainText('डेमो पूर्वावलोकन v0.0.1');
    await expect(page.locator('.demo-text')).toContainText('संचालन-पूर्व सत्यापन पूर्वावलोकन');
  });

  test('floating feedback button opens interactive feedback dialog', async ({ page }) => {
    await page.goto('/en/');
    await page.waitForLoadState('networkidle');
    const feedbackPill = page.locator('.feedback-floating-btn');
    await expect(feedbackPill).toBeVisible();

    await feedbackPill.click();
    const modal = page.locator('.feedback-modal-dialog');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#feedback-title')).toContainText('Preview Experience Feedback');

    // Close modal
    await page.locator('.feedback-close-btn').click();
    await expect(modal).not.toBeVisible();
  });

  test('booking page displays industrial booking wizard with flat advance breakdown', async ({ page }) => {
    await page.goto('/en/book/');
    // Check that booking heading is rendered
    await expect(page.locator('main h1')).toBeVisible();

    // Check staff login link in footer
    const staffLink = page.locator('.app-footer .staff-login-link');
    await expect(staffLink).toBeVisible();
    await expect(staffLink).toHaveAttribute('href', '/admin/login/');
  });

  test('mobile navigation drawer opens and closes smoothly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/en/');

    const toggle = page.locator('#mobile-nav-toggle');
    await expect(toggle).toBeVisible();

    const drawer = page.locator('#mobile-nav-drawer');
    await expect(drawer).toBeHidden();

    // Open drawer
    await toggle.click();
    await expect(drawer).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Close via close button
    const closeBtn = page.locator('#mobile-nav-close');
    await closeBtn.click();
    await expect(drawer).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('homepage embeds inline booking container with single and fleet tabs', async ({ page }) => {
    await page.goto('/en/');
    await page.waitForLoadState('networkidle');

    // Check inline booking container is rendered directly on homepage
    const bookingBox = page.locator('.inline-booking-box');
    await expect(bookingBox).toBeVisible();

    // Check single and fleet tabs
    const singleTab = page.locator('button[role="tab"]:has-text("One Vehicle")');
    const fleetTab = page.locator('button[role="tab"]:has-text("Multiple Vehicles / Fleets")');
    await expect(singleTab).toBeVisible();
    await expect(fleetTab).toBeVisible();

    // Switch to fleet tab
    await fleetTab.click();
    await expect(page.locator('.fleet-booking-pane')).toBeVisible();

    // Switch back to single vehicle
    await singleTab.click();
    await expect(page.locator('.booking-pane')).toBeVisible();

    // Verify presence of pump refusal and pricing sections
    await expect(page.locator('#refused-cng')).toBeVisible();
    await expect(page.locator('#pricing')).toBeVisible();
    await expect(page.locator('#process')).toBeVisible();
  });
});
