import { test, expect } from '@playwright/test';
  import fs from 'fs'; import path from 'path';
  const STAGING_URL = process.env.STAGING_URL;
  const API_BASE = process.env.API_BASE;
  const AUV_ID = process.env.AUV_ID || 'AUV-0004';
  
  test.describe('AUV-0004 UI — cart summary', () => {
    test.skip(!STAGING_URL || !API_BASE, 'STAGING_URL/API_BASE env vars not set');
  
    test('renders rows and totals after API setup', async ({ page, request }) => {
      // Perform setup (add cart items) if any
      const setup = [{"method":"POST","path":"/cart","body":{"productId":"demo-1","qty":2}}];
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
      // Be explicit: wait until cart summary call completes
      await page.waitForResponse(r => r.url().endsWith('/api/cart/summary') && r.ok());
  
      const rows = page.locator('[data-testid="cart-row"]');
      await expect(rows.first()).toBeVisible();
  
      const subtotalText = await page.locator('[data-testid="cart-subtotal"]').innerText();
      const taxText = await page.locator('[data-testid="cart-tax"]').innerText();
      const totalText = await page.locator('[data-testid="cart-total"]').innerText();
      expect(totalText).toMatch(/\$\d/); // some currency
  
      const dir = path.resolve(process.cwd(), 'runs', AUV_ID, 'ui');
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, 'cart_summary.png') });
    });
  });
  