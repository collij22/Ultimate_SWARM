import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
const STAGING_URL = process.env.STAGING_URL;
const API_BASE = process.env.API_BASE;
const AUV_ID = process.env.AUV_ID || 'AUV-0004';

test.describe('AUV-0004 UI — cart summary', () => {
  test.skip(!STAGING_URL || !API_BASE, 'STAGING_URL/API_BASE env vars not set');

  test('renders rows and totals after API setup', async ({ page, request }) => {
    // Deterministic setup: reset cart to avoid residue across runs
    await request.post(`${API_BASE}/reset`, { data: {} });

    // Add items to cart (server-side)
    const setup = [{ method: 'POST', path: '/cart', body: { productId: 'demo-1', qty: 2 } }];
    for (const step of setup) {
      const method = (step.method || 'POST').toUpperCase();
      const rawPath = step.path || '';
      const normPath = rawPath.replace(/^\/api(?=\/|$)/, ''); // strip leading /api if present
      const url = `${API_BASE}${normPath}`;
      if (method === 'POST') {
        await request.post(url, { data: step.body || {} });
      } else if (method === 'GET') {
        await request.get(url);
      }
    }

    await page.goto(`${STAGING_URL}/cart.html`);
    await page.waitForLoadState('domcontentloaded');

    // Wait on DOM state (less flaky than racing the network in CI)
    const rows = page.locator('[data-testid="cart-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 30000 });

    const totalEl = page.locator('[data-testid="cart-total"]');
    await expect(totalEl).toHaveText(/\$\d/, { timeout: 10000 });

    const dir = path.resolve(process.cwd(), 'runs', AUV_ID, 'ui');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'cart_summary.png') });
  });
});
