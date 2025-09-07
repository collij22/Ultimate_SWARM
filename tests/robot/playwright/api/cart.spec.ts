import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE;

test.describe('AUV-0001 API', () => {
  test.skip(!API_BASE, 'API_BASE env var not set');

  test.beforeEach(async ({ request }) => {
    await request.post(`${API_BASE}/reset`).catch(() => {}); // ignore if endpoint missing
  });

  test('POST /cart returns 200 and includes item', async ({ request }) => {
    const res = await request.post(`${API_BASE}/cart`, {
      data: { productId: 'demo-1', qty: 1 },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/demo-1/);
  });

  test('invalid qty -> 400 with error envelope', async ({ request }) => {
    const res = await request.post(`${API_BASE}/cart`, {
      data: { productId: 'demo-1', qty: 0 },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error.code');
  });
});
