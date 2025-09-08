// tests/robot/playwright/auv-0002-ui.spec.ts
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const STAGING_URL = process.env.STAGING_URL;
const AUV_ID = process.env.AUV_ID || 'AUV-0002';
const OUT_DIR = path.resolve(process.cwd(), 'runs', AUV_ID, 'ui');

test.describe('AUV-0002 UI — grid and detail screenshots', () => {
  test.skip(!STAGING_URL, 'STAGING_URL env var not set');

  test('grid: renders grid and saves products_grid.png BEFORE navigation', async ({ page }) => {
    await page.goto(`${STAGING_URL}/products.html`);
    await page.waitForSelector('[data-testid="product-card"]');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(OUT_DIR, 'products_grid.png') });
  });

  test('detail: navigates and saves product_detail.png AFTER navigation', async ({ page }) => {
    await page.goto(`${STAGING_URL}/products.html`);
    await page.waitForSelector('[data-testid="product-card"]');
    await page.locator('[data-testid="product-card"]').first().click();
    await page.waitForSelector('[data-testid="product-detail-title"]');
    await page.waitForSelector('[data-testid="product-detail-price"]');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(OUT_DIR, 'product_detail.png') });
  });
});