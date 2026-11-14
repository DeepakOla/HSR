import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'C:/Users/HP/.gemini/antigravity/brain/62898b4b-62e3-434b-aa7b-d9685ecb2d7e/screenshots';

test.describe('⚡ Visual Screenshots & Interactive Portal Verification', () => {
  test('authenticates staff as owner and captures screenshots across all management desks', async ({ page }) => {
    test.setTimeout(120000);

    // 1. Visit Login at Desktop size
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/login/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login_desktop.png'), fullPage: true });

    // Click owner profile chip and log in
    const ownerChip = page.locator('button.profile-chip[data-email="kumardeepakola@gmail.com"]');
    if (await ownerChip.count() > 0) {
      await ownerChip.click();
    } else {
      await page.fill('#staff-email-input', 'kumardeepakola@gmail.com');
    }
    await page.click('#submit-login-btn');
    await page.waitForURL(/\/admin\/?/);
    await page.waitForLoadState('domcontentloaded');

    // 2. Overview Screen
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_overview_desktop.png'), fullPage: true });

    // Test Desktop Sidebar Collapse Toggle
    const toggleBtn = page.locator('#sidebar-toggle-btn');
    if (await toggleBtn.count() > 0) {
      await toggleBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_overview_sidebar_collapsed.png') });
      // Re-expand
      await toggleBtn.click();
      await page.waitForTimeout(300);
    }

    // 3. Reception Desk (/admin/reception/) via sidebar navigation
    await page.click('a.nav-item[href="/admin/reception/"]');
    await page.waitForURL(/\/admin\/reception\/?/);
    await page.waitForLoadState('domcontentloaded');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_reception_desktop.png'), fullPage: true });

    // 4. Cylinder Register (/admin/cylinder-register/) via sidebar navigation
    await page.click('a.nav-item[href="/admin/cylinder-register/"]');
    await page.waitForURL(/\/admin\/cylinder-register\/?/);
    await page.waitForLoadState('domcontentloaded');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_cylinder_register_desktop.png'), fullPage: true });

    // 5. Master Station Records (/admin/records/) via sidebar navigation
    await page.click('a.nav-item[href="/admin/records/"]');
    await page.waitForURL(/\/admin\/records\/?/);
    await page.waitForLoadState('domcontentloaded');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_records_desktop.png'), fullPage: true });

    // 6. Owner Settings (/admin/owner/) via sidebar navigation
    await page.click('a.nav-item[href="/admin/owner/"]');
    await page.waitForURL(/\/admin\/owner\/?/);
    await page.waitForLoadState('domcontentloaded');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_owner_settings_desktop.png'), fullPage: true });

    // 7. Tablet Viewport (768 x 1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_owner_settings_tablet.png'), fullPage: true });

    // 8. Mobile Viewport (375 x 812)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_owner_settings_mobile.png'), fullPage: true });

    // Test Mobile Drawer Opening
    const hamburgerBtn = page.locator('#sidebar-toggle-btn');
    if (await hamburgerBtn.count() > 0) {
      await hamburgerBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_mobile_drawer_open.png') });
      // Close drawer by clicking close button
      const closeBtn = page.locator('#sidebar-close-btn');
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // Mobile Reception Desk via bottom bar with force: true
    const receptionTab = page.locator('a.mobile-tab[href="/admin/reception/"]');
    if (await receptionTab.count() > 0) {
      await receptionTab.click({ force: true });
      await page.waitForURL(/\/admin\/reception\/?/);
      await page.waitForLoadState('domcontentloaded');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_reception_mobile.png'), fullPage: true });
    }

    // Mobile Cylinder Register via bottom bar with force: true
    const registerTab = page.locator('a.mobile-tab[href="/admin/cylinder-register/"]');
    if (await registerTab.count() > 0) {
      await registerTab.click({ force: true });
      await page.waitForURL(/\/admin\/cylinder-register\/?/);
      await page.waitForLoadState('domcontentloaded');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_cylinder_register_mobile.png'), fullPage: true });
    }
  });
});
