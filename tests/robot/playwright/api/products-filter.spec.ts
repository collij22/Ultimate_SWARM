import { test, expect } from '@playwright/test';
const API_BASE = process.env.API_BASE;
test.describe('AUV-0003 API — baseline', () => {
  test.skip(!API_BASE, 'API_BASE env var not set');

  test('list returns 200 and array', async ({ request }) => {
    const res = await request.get(`${API_BASE}/products`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);
  });

  test('q=3 filters by title', async ({ request }) => {
    const res = await request.get(`${API_BASE}/products?q=3`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body.some((p) => p.id === 'demo-3')).toBeTruthy();
  });
});
