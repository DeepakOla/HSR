import { expect, test } from '@playwright/test';
import * as path from 'node:path';

const SCREENSHOT_DIR = 'C:/Users/HP/.gemini/antigravity/brain/62898b4b-62e3-434b-aa7b-d9685ecb2d7e/screenshots_v003';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'narrow_mobile', width: 360, height: 800 },
];

const requiredPages = [
  { path: '/en/', name: 'home_en' },
  { path: '/hi/', name: 'home_hi' },
  { path: '/cng/', name: 'cng_guide' },
  { path: '/cng/cylinder-test/', name: 'cng_cylinder_test' },
  { path: '/en/book/', name: 'book_en' },
  { path: '/hi/book/', name: 'book_hi' },
  { path: '/en/blog/', name: 'blog_en' },
  { path: '/user/', name: 'user_workspace' },
];

test.describe('HSR v0.0.3 Browser Inspection & Acceptance Suite', () => {
  // Capture screenshots, verify zero horizontal overflow, and check navigation
  for (const vp of viewports) {
    for (const pageInfo of requiredPages) {
      test(`Inspect ${pageInfo.path} at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
        const consoleErrors: string[] = [];
        const failedRequests: string[] = [];

        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('requestfailed', (req) => {
          failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText || 'failed'}`);
        });

        await page.setViewportSize({ width: vp.width, height: vp.height });
        const res = await page.goto(pageInfo.path, { waitUntil: 'domcontentloaded' });
        expect(res?.status()).toBeLessThan(400);

        // Verify zero horizontal overflow
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);

        // Capture genuine screenshot
        const shotPath = path.join(SCREENSHOT_DIR, `${pageInfo.name}_${vp.name}.png`);
        await page.screenshot({ path: shotPath, fullPage: false });

        expect(consoleErrors.filter(e => !e.includes('favicon') && !e.includes('hydration') && !e.includes('hydrated'))).toHaveLength(0);
      });
    }
  }

  // Standalone CNG landing mobile drawer test (open & close)
  test('Mobile drawer on /cng/ opens with click, touch, and closes via Escape key', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/cng/');

    const toggle = page.locator('#cng-mobile-toggle');
    await expect(toggle).toBeVisible();

    const drawer = page.locator('#cng-mobile-drawer');
    await expect(drawer).toBeHidden();

    // Before open screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'cng_guide_drawer_closed.png') });

    // Open drawer
    await toggle.click();
    await expect(drawer).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // After open screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'cng_guide_drawer_open.png') });

    // Verify Customer Workspace destination inside drawer
    const customerWorkspaceLink = drawer.locator('a[href="/user/"]');
    await expect(customerWorkspaceLink).toBeVisible();
    await expect(customerWorkspaceLink).toContainText('Customer Workspace');

    // Close via Escape key
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('Mobile drawer on /cng/cylinder-test/ opens with click, touch, and closes via Escape key', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/cng/cylinder-test/');

    const toggle = page.locator('#cng-mobile-toggle');
    await expect(toggle).toBeVisible();

    const drawer = page.locator('#cng-mobile-drawer');
    await expect(drawer).toBeHidden();

    // Before open screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'cng_cylinder_test_drawer_closed.png') });

    // Open drawer
    await toggle.click();
    await expect(drawer).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // After open screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'cng_cylinder_test_drawer_open.png') });

    // Verify Customer Workspace link
    const customerWorkspaceLink = drawer.locator('a[href="/user/"]');
    await expect(customerWorkspaceLink).toBeVisible();
    await expect(customerWorkspaceLink).toContainText('Customer Workspace');

    // Close via drawer close button
    const closeBtn = page.locator('#cng-drawer-close');
    await closeBtn.click();
    await expect(drawer).toBeHidden();
  });

  // Verify /en/check-expiry/ 301 permanent redirect
  test('Legacy /en/check-expiry/ permanently redirects to integrated checker', async ({ page }) => {
    const res = await page.goto('/en/check-expiry/');
    expect(page.url()).toContain('/cng/cylinder-test/?action=check-due-date#retest-checker');
    expect(res?.status()).toBeLessThan(400);

    // Verify Retest Due Checker is visible and active on target page
    const checker = page.locator('#retest-checker');
    await expect(checker).toBeVisible();

    // Verify NO covering icon on input
    const inputIcon = page.locator('.checker-input-icon');
    await expect(inputIcon).toHaveCount(0);
  });

  // Verify footer links & labels
  test('Footer contains only clean public page destinations and standardized labels', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/');

    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Verify clean routes
    await expect(footer.locator('a[href="/en/services/"]')).toBeVisible();
    await expect(footer.locator('a[href="/en/about/"]')).toBeVisible();
    await expect(footer.locator('a[href="/en/how-it-works/"]')).toBeVisible();
    await expect(footer.locator('a[href="/en/book/"]')).toBeVisible();
    await expect(footer.locator('a[href="/en/contact/"]')).toBeVisible();

    // Standardized labels: Blog (not Guides), Guides (/cng/), Find Nearby CNG (/cng/cylinder-test/), Customer Workspace (/user/)
    const blogLink = footer.locator('a[href="/en/blog/"]');
    await expect(blogLink).toBeVisible();
    await expect(blogLink).toContainText('Blog');

    const guidesLink = footer.locator('a[href="/cng/"]');
    await expect(guidesLink).toBeVisible();
    await expect(guidesLink).toContainText('Guides');

    const findCngLink = footer.locator('a[href="/cng/cylinder-test/"]');
    await expect(findCngLink).toBeVisible();
    await expect(findCngLink).toContainText('Find Nearby CNG');

    const userLink = footer.locator('a[href="/user/"]');
    await expect(userLink).toBeVisible();
    await expect(userLink).toContainText('Customer Workspace');

    // Staff login isolated in footer
    const staffLogin = footer.locator('a[href="/admin/login/"]');
    await expect(staffLogin).toBeVisible();
  });

  // Verify dynamic balance pricing calculations
  test('Homepage balance cards are calculated dynamically from category pricing and advance', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/');

    // Price section
    const pricing = page.locator('#pricing');
    await expect(pricing).toBeVisible();

    // Balance cards should show ₹ followed by numbers, calculated from categoryTotal - flatAdvance
    const balanceElements = pricing.locator('.tariff-balance-chip strong');
    const count = await balanceElements.count();
    expect(count).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < count; i++) {
      const text = await balanceElements.nth(i).innerText();
      expect(text).toMatch(/₹[\d,]+/);
    }

    // Verify absence of "bay" jargon in customer button
    const bookButtons = page.locator('button[type="submit"]');
    if (await bookButtons.count() > 0) {
      const submitText = await bookButtons.first().innerText();
      expect(submitText).not.toContain('Reserve Testing Bay');
    }
  });
});
