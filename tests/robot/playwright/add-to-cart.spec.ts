import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const STAGING_URL = process.env.STAGING_URL;
const API_BASE = process.env.API_BASE;
const selectors = require('./cart.selectors.json');

test.describe('AUV-0001 UI', () => {
  test.skip(!STAGING_URL, 'STAGING_URL env var not set');

  test.beforeEach(async ({ request }) => {
    if (API_BASE) await request.post(`${API_BASE}/reset`).catch(() => {});
  });

  test('add to cart increments cart count to 1 from 0', async ({ page }, testInfo) => {
    await page.goto(STAGING_URL!);

    const addBtn = page.locator(selectors.addToCart);
    const cartCount = page.locator(selectors.cartCount);

    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await expect(cartCount).toHaveText(/\b0\b/, { timeout: 5_000 });

    await addBtn.click();
    await expect(cartCount).toHaveText(/\b1\b/, { timeout: 10_000 });

    const runDir = path.resolve(process.cwd(), 'runs', 'AUV-0001', testInfo.project.name);
    fs.mkdirSync(runDir, { recursive: true });
    await page.screenshot({ path: path.join(runDir, 'cart_after.png') });
  });
});
