import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
const STAGING_URL = process.env.STAGING_URL;
const AUV_ID = process.env.AUV_ID || 'AUV-0005';

test.describe('AUV-0005 UI — checkout', () => {
  test.skip(!STAGING_URL, 'STAGING_URL env var not set');

  test('fills form, submits, shows success', async ({ page }) => {
    await page.goto(`${STAGING_URL}/checkout.html`);
    await page.fill('#name', 'Jane Tester');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#address', '1 Test Street');
    await page.fill('#card', '4242424242424242');

    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/checkout')),
      page.click('[data-testid="submit-order"]'),
    ]);
    expect(resp.ok()).toBeTruthy();

    await expect(page.locator('[data-testid="order-success"]')).toBeVisible();

    const dir = path.resolve(process.cwd(), 'runs', AUV_ID, 'ui');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'checkout_success.png') });
  });
});
