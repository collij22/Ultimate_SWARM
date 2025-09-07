import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.API_BASE;
test.describe('AUV-0002 API', () => {
  test.skip(!API_BASE, 'API_BASE env var not set');

  test('GET /products returns 200 array with at least 1 item', async ({ request }) => {
    const res = await request.get(`${API_BASE}/products`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);

    const dir = path.resolve(process.cwd(), 'runs', 'AUV-0002', 'api');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'get_products_200.json'), JSON.stringify(body, null, 2));
  });

  test('GET /products/{id} returns 200 and matches list id', async ({ request }) => {
    const list = await (await request.get(`${API_BASE}/products`)).json();
    const first = list[0];
    const res = await request.get(`${API_BASE}/products/${first.id}`);
    expect(res.status()).toBe(200);
    const detail = await res.json();
    expect(detail.id).toBe(first.id);

    const dir = path.resolve(process.cwd(), 'runs', 'AUV-0002', 'api');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'get_product_detail_200.json'),
      JSON.stringify(detail, null, 2),
    );
  });
});
