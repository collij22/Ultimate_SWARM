import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.API_BASE;
const STAGING_URL = process.env.STAGING_URL;

/* ---------------------------------------
 * AUV-0003 API — search & filter (your originals)
 * ------------------------------------- */
test.describe('AUV-0003 API  search & filter', () => {
  test.skip(!API_BASE, 'API_BASE env var not set');

  test('q=3 returns only Demo Product 3', async ({ request }) => {
    const res = await request.get(`${API_BASE}/products?q=3`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].id).toBe('demo-3');
  });

  test('minPrice=10 maxPrice=20 bounds results', async ({ request }) => {
    const res = await request.get(`${API_BASE}/products?minPrice=10&maxPrice=20`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((p: any) => p.price >= 10 && p.price <= 20)).toBe(true);
  });

  test('sort=price_desc orders highlow', async ({ request }) => {
    const res = await request.get(`${API_BASE}/products?sort=price_desc`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (let i = 1; i < body.length; i++) {
      expect(body[i - 1].price).toBeGreaterThanOrEqual(body[i].price);
    }
  });
});

/* ---------------------------------------
 * AUV-0003 UI — search & filter (with robust waits)
 * ------------------------------------- */
test.describe('AUV-0003 UI  search & filter', () => {
  test.skip(!STAGING_URL, 'STAGING_URL env var not set');

  test('search narrows grid to 1 result and navigates', async ({ page }) => {
    await page.goto(`${STAGING_URL}/products.html`);
    await page.fill('#q', '3');

    // Wait for /api/products to return after clicking Apply
    const apiWait = page.waitForResponse(r => r.url().includes('/api/products') && r.status() === 200);
    await page.click('text=Apply');
    await apiWait;

    // Wait until at least one card is rendered
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="product-card"]').length > 0);

    const cards = page.locator('[data-testid="product-card"]');
    await expect(cards).toHaveCount(1);
    await expect(page.locator('[data-testid="product-title"]')).toHaveText(/Demo Product 3/);

    // Save proof artifact for CVF
    const dir = path.resolve(process.cwd(), 'runs', 'AUV-0003', 'ui');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'products_search.png') });

    // Navigation still works
    await cards.first().click();
    await expect(page.locator('[data-testid="product-detail-title"]')).toHaveText(/Demo Product 3/);
  });

  test('price bounds reduce results', async ({ page }) => {
    await page.goto(`${STAGING_URL}/products.html`);
    await page.fill('#minPrice', '10');
    await page.fill('#maxPrice', '20');

    // Wait for the filtered fetch to complete before asserting
    const apiWait = page.waitForResponse(r => r.url().includes('/api/products') && r.status() === 200);
    await page.click('text=Apply');
    await apiWait;

    // Wait until at least one card is rendered
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="product-card"]').length > 0);

    const prices = page.locator('[data-testid="product-price"]');
    await expect(prices.first()).toBeVisible();

    const count = await prices.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const t = await prices.nth(i).innerText();
      const num = parseFloat(t.replace('$', ''));
      expect(num).toBeGreaterThanOrEqual(10);
      expect(num).toBeLessThanOrEqual(20);
    }
  });
});
