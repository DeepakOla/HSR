import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'Desktop Large', width: 1440, height: 900 },
  { name: 'Laptop', width: 1024, height: 768 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Mobile', width: 375, height: 812 },
];

test.describe('⚡ HSR Management Portal Theme & Responsive Navigation', () => {
  for (const vp of viewports) {
    test(`renders cleanly without horizontal overflow at ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // Login or direct visit to admin login
      await page.goto('/admin/login/');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
