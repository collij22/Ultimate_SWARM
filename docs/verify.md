## Purpose
This document provides **copy‑pasteable, deterministic** steps to verify each delivered AUV.
Every section is anchored by **AUV-ID** so robots and reviewers can deep‑link.

> **IMPORTANT:** Use **staging/test** values only. Never include production secrets.

## Conventions
- **Artifacts** are written under `runs/<AUV-ID>/<RUN-ID>/...` by the User Robot or lanes.
- **Env vars**: set `STAGING_URL` and `API_BASE` (see `docs/runbook.md`).
- **Pass criteria** are stated explicitly (HTTP code, DOM selector values, DB assertions).

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
# Headless UI journey; captures video and screenshot on failure
npx playwright test tests/robot/playwright --grep "add to cart"
```
**Pass if:** element `[data-testid="cart-count"]` shows **1** after the add action.

**Artifacts:**
- `runs/AUV-0001/<RUN-ID>/ui/add_to_cart.webm`
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