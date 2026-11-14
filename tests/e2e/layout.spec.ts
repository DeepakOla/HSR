import { expect, test } from '@playwright/test';

const widths = [360, 375, 390, 430, 768, 1024, 1280, 1440];

test.describe('public layout', () => {
  for (const width of widths) {
    test(`no horizontal overflow at width ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/en/');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
