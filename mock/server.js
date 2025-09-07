// mock/server.js
// Minimal "staging" server for Swarm1 demos.

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static UI (serves public/*)
app.use('/', express.static(path.join(__dirname, 'public')));

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// --- CHECKOUT (AUV-0005) ---
app.post('/api/checkout', (req, res) => {
  const { name, email, address, card } = req.body || {};
  const bad = [];
  if (!name || String(name).trim().length < 2) bad.push('name');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) bad.push('email');
  if (!address || String(address).trim().length < 5) bad.push('address');
  if (!card || !/^\d{16}$/.test(String(card))) bad.push('card');

  if (bad.length)
    return res.status(400).json({ error: { fields: bad, message: 'Invalid fields' } });

  const orderId = `ord_${Math.random().toString(36).slice(2, 10)}`;
  return res.status(201).json({ orderId });
});

// ----------------- CART (AUV-0001/0004) -----------------
let cart = { items: [], count: 0 };

// POST /api/cart
app.post('/api/cart', (req, res) => {
  const { productId, qty } = req.body || {};
  if (!productId || typeof qty !== 'number' || qty < 1) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'qty must be >= 1' } });
  }
  const existing = cart.items.find((i) => i.productId === productId);
  if (existing) existing.qty += qty;
  else cart.items.push({ productId, qty });
  cart.count += qty;
  return res.json(cart);
});

const TAX_RATE = 0.1;

// GET /api/cart  -> array of items
app.get('/api/cart', (_req, res) => {
  res.json(cart.items);
});

// GET /api/cart/summary -> priced lines + totals
app.get('/api/cart/summary', (_req, res) => {
  const items = cart.items.map((entry) => {
    const prod = PRODUCTS.find((p) => p.id === entry.productId);
    const price = prod ? prod.price : 0;
    const lineTotal = +(price * entry.qty).toFixed(2);
    return {
      id: entry.productId,
      title: prod ? prod.title : entry.productId,
      price,
      qty: entry.qty,
      lineTotal,
    };
  });
  const subtotal = +items.reduce((s, it) => s + it.lineTotal, 0).toFixed(2);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);
  res.json({ items, subtotal, tax, total });
});

// Optional reset for tests
app.post('/api/reset', (_req, res) => {
  cart = { items: [], count: 0 };
  res.json({ ok: true });
});

// ----------------- PRODUCTS (AUV-0002) -----------------
// Demo products (static)
const PRODUCTS = [
  { id: 'demo-1', title: 'Demo Product 1', price: 9.99, imageUrl: '/img/demo1.png' },
  { id: 'demo-2', title: 'Demo Product 2', price: 14.5, imageUrl: '/img/demo2.png' },
  { id: 'demo-3', title: 'Demo Product 3', price: 29.0, imageUrl: '/img/demo3.png' },
  { id: 'demo-4', title: 'Demo Product 4', price: 4.99, imageUrl: '/img/demo4.png' },
  { id: 'demo-5', title: 'Demo Product 5', price: 11.99, imageUrl: '/img/demo5.png' },
  { id: 'demo-6', title: 'Demo Product 6', price: 19.99, imageUrl: '/img/demo6.png' },
];

// GET /api/products  — REPLACE the old handler with this one
app.get('/api/products', (req, res) => {
  const { q, minPrice, maxPrice, sort } = req.query;
  let out = [...PRODUCTS];

  // text search
  if (q && String(q).trim()) {
    const s = String(q).toLowerCase();
    out = out.filter((p) => p.title.toLowerCase().includes(s));
  }

  // price bounds
  const min = minPrice !== undefined ? Number(minPrice) : undefined;
  const max = maxPrice !== undefined ? Number(maxPrice) : undefined;
  if (!Number.isNaN(min) && min !== undefined) out = out.filter((p) => p.price >= min);
  if (!Number.isNaN(max) && max !== undefined) out = out.filter((p) => p.price <= max);

  // sorting
  if (sort === 'price_asc') out.sort((a, b) => a.price - b.price);
  if (sort === 'price_desc') out.sort((a, b) => b.price - a.price);
  if (sort === 'title_asc') out.sort((a, b) => a.title.localeCompare(b.title));

  res.json(out);
});

// GET /api/products/:id  — LEAVE THIS UNCHANGED
app.get('/api/products/:id', (req, res) => {
  const p = PRODUCTS.find((x) => x.id === req.params.id);
  if (!p)
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
  res.json(p);
});

// API: POST /api/checkout
app.post('/api/checkout', (req, res) => {
  const { name, email, address, card } = req.body || {};
  const bad = [];
  if (!name || name.length < 2) bad.push('name');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) bad.push('email');
  if (!address || address.length < 5) bad.push('address');
  if (!card || !/^\d{16}$/.test(String(card))) bad.push('card');

  if (bad.length)
    return res.status(400).json({ error: { fields: bad, message: 'Invalid fields' } });
  const orderId = `ord_${Math.random().toString(36).slice(2, 10)}`;
  return res.status(201).json({ orderId });
});

// -------------------------------------------------------

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`[mock] staging running on http://localhost:${port}`);
});
