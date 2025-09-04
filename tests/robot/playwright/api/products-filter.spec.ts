import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE;

test.describe('AUV-0003 API — search & filter', () => {
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

  test('sort=price_desc orders high→low', async ({ request }) => {
    const res = await request.get(`${API_BASE}/products?sort=price_desc`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (let i = 1; i < body.length; i++) {
      expect(body[i - 1].price).toBeGreaterThanOrEqual(body[i].price);
    }
  });
});
