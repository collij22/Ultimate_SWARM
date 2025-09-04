import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const STAGING_URL = process.env.STAGING_URL;

test.describe('AUV-0002 UI', () => {
  test.skip(!STAGING_URL, 'STAGING_URL env var not set');

  test('products grid renders and navigates to detail', async ({ page }, testInfo) => {
    await page.goto(`${STAGING_URL}/products.html`);

    const grid = page.locator('[data-testid="product-grid"]');
    await expect(grid).toBeVisible();
    const cards = page.locator('[data-testid="product-card"]');
    await expect(cards).toHaveCount(6); // matches our static catalog

    // Click first card and wait for detail
    await cards.first().click();
    await expect(page.locator('[data-testid="product-detail-title"]')).toBeVisible();

    // Save artifacts
    const dir = path.resolve(process.cwd(), 'runs', 'AUV-0002', 'ui');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'products_grid.png') });
    await page.screenshot({ path: path.join(dir, 'product_detail.png') });
  });
});
