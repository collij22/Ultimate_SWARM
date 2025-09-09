## Purpose

This document provides **copy-pasteable, deterministic** steps to verify each delivered AUV.
Every section is anchored by **AUV-ID** so robots and reviewers can deep-link.

> **IMPORTANT:** Use **staging/test** values only. Never include production secrets.

## Conventions

- **Artifacts** are written under `runs/<AUV-ID>/...` by the runbook and tests.
  - For multi-tenant execution (Phase 8), non-default tenants use `runs/tenants/{tenant}/<AUV-ID>/...`
- **Env vars**: set `STAGING_URL` and `API_BASE` (see `docs/runbook.md`).
- **Pass criteria** are stated explicitly (HTTP code, DOM selector values, file presence).
- You can either run **manual curl/UI checks** or use the **one-button runbook**:

  ```sh
  # Example: run end-to-end proof for an AUV (CLI)
  node orchestration/cli.mjs AUV-0003

  # Or via queue (Phase 8 - requires Redis)
  node orchestration/cli.mjs engine enqueue run_graph \
    --graph orchestration/graph/projects/demo-01.yaml \
    --tenant default
  ```

---

## AUV-0001 — Add to Cart (API + UI)

**Goal:** A user can add a product to the cart; the API returns 200 and the UI cart count increments.

### Verify API

```sh
# Expect: HTTP 200 and JSON including `items[0].productId = demo-1` and `qty = 1`
curl -s -X POST "$API_BASE/cart" \
  -H 'Content-Type: application/json' \
  -d '{"productId":"demo-1","qty":1}' | jq .
```

**Pass if:** status is **200** and payload contains the added item.

**Artifacts:**

- `runs/AUV-0001/<RUN-ID>/api/post_cart_200.json`

### Verify UI (Playwright)

```sh
npx playwright test -c tests/robot/playwright/playwright.config.ts \
  tests/robot/playwright/add-to-cart.spec.ts
```

**Pass if:** element `[data-testid="cart-count"]` shows **1** after the add action.

**Artifacts (typical):**

- `runs/AUV-0001/<RUN-ID>/ui/add_to_cart.webm` (video on failure)
- `runs/AUV-0001/<RUN-ID>/ui/add_to_cart_dom.json` (optional DOM snapshot)

### Optional DB Assertion (if enabled)

```sql
-- Expect a row with qty >= 1 for the demo product
SELECT qty FROM cart_items WHERE product_id='demo-1' LIMIT 1;
```

**Artifacts:**

- `runs/AUV-0001/<RUN-ID>/data/cart_row.json`

---

## Adding new AUV sections

1. Create the AUV spec in `capabilities/` (id, acceptance, proofs).
2. Freeze/extend the contract in `contracts/openapi.yaml` and/or `contracts/events.yaml`.
3. Update this file with **API/UI/DB** verify steps and explicit **pass criteria**.
4. Link the recorded **artifact paths** produced by the robot.
5. Keep each section runnable in **< 5 minutes**.

---

## AUV-0002 — Product Listing & Detail

**Goal:** A user can see a products grid and open a product detail page with title/price.

### Verify API

```sh
curl -s "$API_BASE/products" | jq . > runs/AUV-0002/api/get_products_200.json
id=$(curl -s "$API_BASE/products" | jq -r '.[0].id')
curl -s "$API_BASE/products/$id" | jq . > runs/AUV-0002/api/get_product_detail_200.json
```

**Pass if:** both commands return 200, list has length > 0, detail includes id, title, price.

### Verify UI (Playwright)

```sh
npx playwright test -c tests/robot/playwright/playwright.config.ts \
  tests/robot/playwright/products.spec.ts
```

**Pass if:** products grid renders (`[data-testid="product-card"]` count > 0) and navigating to detail shows title & price.

### Perf & CVF

```sh
# Lighthouse proof
node scripts/perf_lighthouse.mjs "$STAGING_URL/products.html" "runs/AUV-0002/perf/lighthouse.json"
# CVF gate
node orchestration/cvf-check.mjs AUV-0002
```

**Artifacts required by CVF:**

- `runs/AUV-0002/api/get_products_200.json`
- `runs/AUV-0002/ui/products_grid.png`
- `runs/AUV-0002/ui/product_detail.png`
- `runs/AUV-0002/perf/lighthouse.json`

---

## AUV-0003 — Product Search & Filter

**Goal:** Search by text, constrain by price bounds, and sort results; UI reflects filters.

### Verify API

```sh
curl -s "$API_BASE/products?q=3" | jq .
curl -s "$API_BASE/products?minPrice=10&maxPrice=20" | jq .
curl -s "$API_BASE/products?sort=price_desc" | jq .
```

**Pass if:**

- `q=3` returns only "Demo Product 3"
- `minPrice=10&maxPrice=20` returns items with 10 <= price <= 20
- `sort=price_desc` is non-increasing by price

### Verify UI (Playwright)

```sh
npx playwright test -c tests/robot/playwright/playwright.config.ts \
  tests/robot/playwright/products-filter.spec.ts
```

**Pass if:** entering 3 in `#q` and clicking Apply narrows to one card "Demo Product 3"; price-bounds case reduces results and all visible prices fall within bounds.

### Perf & CVF

```sh
node scripts/perf_lighthouse.mjs "$STAGING_URL/products.html" "runs/AUV-0003/perf/lighthouse.json"
node orchestration/cvf-check.mjs AUV-0003
```

**Artifacts required by CVF:**

- `runs/AUV-0003/ui/products_search.png`
- `runs/AUV-0003/perf/lighthouse.json`

---

## AUV-0004 — Cart Summary (totals)

**Goal:** API returns line totals and subtotal/tax/total; UI renders rows and totals.

### Verify API

```sh
# Reset, add item(s)
curl -s -X POST "$API_BASE/reset" -H 'Content-Type: application/json' | jq .
curl -s -X POST "$API_BASE/cart" -H 'Content-Type: application/json' -d '{"productId":"demo-1","qty":2}' | jq .
# Summary
curl -s "$API_BASE/cart/summary" | jq .
```

**Pass if:** summary payload includes `items[]` with id, qty, lineTotal, and coherent subtotal, tax, total where total ≈ subtotal + tax.

### Verify UI (Playwright)

```sh
npx playwright test -c tests/robot/playwright/playwright.config.ts \
  tests/robot/playwright/cart-summary.spec.ts
```

**Pass if:** `/cart.html` renders at least one `[data-testid="cart-row"]` and shows numeric `[data-testid="cart-subtotal"]`, `[data-testid="cart-tax"]`, `[data-testid="cart-total"]`.

### Perf & CVF

```sh
node scripts/perf_lighthouse.mjs "$STAGING_URL/cart.html" "runs/AUV-0004/perf/lighthouse.json"
node orchestration/cvf-check.mjs AUV-0004
```

**Artifacts required by CVF:**

- `runs/AUV-0004/ui/cart_summary.png`
- `runs/AUV-0004/perf/lighthouse.json`

---

## AUV-0005 — Checkout

**Goal:** User submits checkout form and receives an orderId (201); UI shows success banner.

### Verify API

```sh
curl -s -X POST "$API_BASE/checkout" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane","email":"jane@example.com","address":"1 Test St","card":"4242424242424242"}' | jq .
```

**Pass if:** HTTP status is 201 and response contains `{ orderId }`

### Verify UI (Playwright)

```sh
npx playwright test -c tests/robot/playwright/playwright.config.ts \
  tests/robot/playwright/checkout.spec.ts
```

**Pass if:** the form at `/checkout.html` submits (network call to `/api/checkout` is ok) and `[data-testid="order-success"]` becomes visible.

### Perf & CVF

```sh
node scripts/perf_lighthouse.mjs "$STAGING_URL/checkout.html" "runs/AUV-0005/perf/lighthouse.json"
node orchestration/cvf-check.mjs AUV-0005
```

**Artifacts required by CVF:**

- `runs/AUV-0005/ui/checkout_success.png`
- `runs/AUV-0005/perf/lighthouse.json`

---

## Adding new AUV sections

1. Create the AUV spec in `capabilities/<AUV-ID>.yaml` (id, acceptance, authoring_hints)
2. Extend the contract in `contracts/openapi.yaml` and/or `contracts/events.yaml` as needed
3. Re-run: `node orchestration/cli.mjs <AUV-ID>` (auto-authors tests if missing and produces artifacts)
4. Update this file with API/UI verify steps and explicit pass criteria
5. If CVF should gate the AUV, add expected artifacts in `orchestration/cvf-check.mjs`
6. Keep each section runnable in **< 5 minutes**
