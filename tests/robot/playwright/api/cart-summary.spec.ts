import { test, expect } from '@playwright/test';
const API_BASE = process.env.API_BASE;

test.describe('AUV-0004 API — cart summary', () => {
  test.skip(!API_BASE, 'API_BASE env var not set');

  test('setup cart then summary returns correct lineTotal & totals shape', async ({ request }) => {
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

    const sumRes = await request.get(`${API_BASE}/cart/summary`);
    expect(sumRes.status()).toBe(200);
    const sum = await sumRes.json();
    expect(Array.isArray(sum.items)).toBeTruthy();

    // If setup added demo-1, validate its lineTotal against unit price
    const added = setup.find((s) => (s.body || {}).productId);
    if (added) {
      const id = added.body.productId;
      const qty = added.body.qty || 1;
      const prod = await (await request.get(`${API_BASE}/products/${id}`)).json();
      const expectedLine = +(prod.price * qty).toFixed(2);
      const item = sum.items.find((it) => it.id === id);
      expect(item).toBeTruthy();
      expect(item.lineTotal).toBeCloseTo(expectedLine, 2);
    }

    // Totals are coherent
    expect(typeof sum.subtotal).toBe('number');
    expect(typeof sum.tax).toBe('number');
    expect(typeof sum.total).toBe('number');
    expect(sum.total).toBeCloseTo(sum.subtotal + sum.tax, 2);
  });
});
