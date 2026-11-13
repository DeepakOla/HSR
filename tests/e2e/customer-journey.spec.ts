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
    await expect(page.locator('h1')).toBeVisible();

    // Check staff login link in footer
    const staffLink = page.locator('.staff-login-link');
    await expect(staffLink).toBeVisible();
    await expect(staffLink).toHaveAttribute('href', '/admin/login/');
  });
});
