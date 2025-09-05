import { test, expect } from '@playwright/test';
  const API_BASE = process.env.API_BASE;
  
  test.describe('AUV-0005 API — custom', () => {
    test.skip(!API_BASE, 'API_BASE env var not set');
  
    test('valid -> 201', async ({ request }) => {
      const method = 'POST';
      const rawPath = '/checkout';
      const normPath = rawPath.replace(/^\/api(?=\/|$)/, '');
      const url = `${API_BASE}${normPath}`;
      let res;
      if (method === 'POST') {
        res = await request.post(url, { data: {"name":"Jane","email":"jane@example.com","address":"1 Test St","card":"4242424242424242"} });
      } else if (method === 'PUT') {
        res = await request.put(url, { data: {"name":"Jane","email":"jane@example.com","address":"1 Test St","card":"4242424242424242"} });
      } else if (method === 'PATCH') {
        res = await request.patch(url, { data: {"name":"Jane","email":"jane@example.com","address":"1 Test St","card":"4242424242424242"} });
      } else if (method === 'DELETE') {
        res = await request.delete(url);
      } else { // GET default
        res = await request.get(url);
      }
      const expected = 201;
      expect(res.status()).toBe(expected);
    });
  });
  