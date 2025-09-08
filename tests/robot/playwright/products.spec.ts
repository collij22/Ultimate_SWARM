import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const STAGING_URL = process.env.STAGING_URL;
const AUV_ID = process.env.AUV_ID;
const isAUV0002 = AUV_ID === 'AUV-0002';

test.describe('Products UI (Legacy)', () => {
  test.skip(!STAGING_URL, 'STAGING_URL env var not set');
  test.skip(isAUV0002, 'Skipped for AUV-0002 (uses dedicated spec)');

  test('products grid renders and navigates to detail', async ({ page }) => {
    await page.goto(`${STAGING_URL}/products.html`);

    const grid = page.locator('[data-testid="product-grid"]');
    await expect(grid).toBeVisible();
    const cards = page.locator('[data-testid="product-card"]');
    // Relaxed assertion - more resilient to seed data changes
    expect(await cards.count()).toBeGreaterThanOrEqual(1);

    // Save grid screenshot BEFORE navigation
    const dir = path.resolve(process.cwd(), 'runs', 'products-legacy', 'ui');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'products_grid_legacy.png') });

    // Click first card and wait for detail
    await cards.first().click();
    await expect(page.locator('[data-testid="product-detail-title"]')).toBeVisible();

    // Save detail screenshot AFTER navigation
    await page.screenshot({ path: path.join(dir, 'product_detail_legacy.png') });
  });
});
