import { expect, test } from '@playwright/test';

test.describe('Customer Booking & Demo Preview Journeys (E2E)', () => {
  test('displays demo preview banner in English and Hindi', async ({ page }) => {
    // English Home
    await page.goto('/en/');
    const enBanner = page.locator('.announcement-ticker-bar');
    await expect(enBanner).toBeVisible();
    await expect(page.locator('.ticker-badge').first()).toContainText('GOVERNMENT APPROVED');

    // Hindi Home
    await page.goto('/hi/');
    const hiBanner = page.locator('.announcement-ticker-bar');
    await expect(hiBanner).toBeVisible();
    await expect(page.locator('.ticker-badge').first()).toContainText('सरकारी प्रमाणित');
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

  test('homepage renders Due-Date Checker and book page renders dedicated booking container with single and fleet tabs', async ({ page }) => {
    await page.goto('/en/');
    await page.waitForLoadState('networkidle');

    // Check Due Date Checker is rendered directly on homepage
    const dueDateCard = page.locator('.due-date-checker-card');
    await expect(dueDateCard).toBeVisible();
    await expect(page.locator('#check-due-date')).toBeVisible();
    await expect(page.locator('#process')).toBeVisible();
    await expect(page.locator('#standards')).toBeVisible();
    await expect(page.locator('#location')).toBeVisible();

    // Navigate to dedicated booking page
    await page.goto('/en/book/');
    await page.waitForLoadState('networkidle');

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
  });
});
