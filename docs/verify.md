## Purpose

This document provides **copy-pasteable, deterministic** steps to verify each delivered AUV.
Every section is anchored by **AUV-ID** so robots and reviewers can deep-link.

> **IMPORTANT:** Use **staging/test** values only. Never include production secrets.

## Conventions

- **Artifacts** are written under `runs/<AUV-ID>/...` by the runbook and tests.
  - For multi-tenant execution (Phase 8), non-default tenants use `runs/tenants/{tenant}/<AUV-ID>/...`
- **Subagent artifacts** (Phase 10b): transcripts and tool_results under `runs/agents/<role>/<session>/` and `runs/tenants/{tenant}/agents/<node>/`.
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

### Phase 10b — Mode Verification (Golden Graph)

To verify tri‑mode orchestration using the seo-audit demo:

````bash
# Deterministic
node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml --concurrency 3

# Claude (Windows)
set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml --concurrency 3

# Hybrid (Windows)
set SWARM_MODE=hybrid && set SUBAGENTS_INCLUDE=A2.requirements_analyst,B7.rapid_builder && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml --concurrency 3

### Phase 12 — Demo Datasets & TEST_MODE

Deterministic and claude-mode demo graphs are provided to exercise the data/media, SEO/reporting, and Secondary integrations end‑to‑end. In TEST_MODE, networked steps are replaced with local fixtures and the router bypasses real API key checks for Secondary stubs during planning; performance budgets may be skipped if Lighthouse artifacts are not available.

```bash
# Data → Insights → Chart → TTS → Video → Package → Report
set TEST_MODE=true && node orchestration/graph/runner.mjs orchestration/graph/projects/data-video-demo.yaml

# SEO Search/Fetch → Audit → Doc → Package → Report
set TEST_MODE=true && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml

# Optional stable RUN_ID for predictable artifact paths
set RUN_ID=RUN-demo && node orchestration/graph/runner.mjs orchestration/graph/projects/data-video-demo.yaml
````

CVF strict auto‑detects domains. In TEST_MODE, performance budgets are evaluated when Lighthouse artifacts exist; otherwise, the budget evaluator records a "skipped" summary and CVF does not fail on missing perf data.

````

Pass if:

- Graph completes with 0 failed nodes in each mode
- `runs/websearch_demo/{summary.json,first_result.html}` exist
- Subagent gateway and tool results present when SWARM_MODE=claude/hybrid:
  - `runs/agents/<role>/<session>/thread.jsonl`
  - `runs/tenants/default/agents/<node>/result-gateway.json`
  - `runs/tenants/default/agents/<node>/tool_results.json`

### Phase 13 — Secondary Demos (Verification)

Run each Secondary demo in both deterministic and claude modes (Windows examples):

```bash
# Large-scale SEO audit (firecrawl)
set TEST_MODE=true && set SWARM_MODE=deterministic && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-large.yaml
set TEST_MODE=true && set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-large.yaml

# Payments test (Stripe)
set TEST_MODE=true && set SWARM_MODE=deterministic && node orchestration/graph/runner.mjs orchestration/graph/projects/payments-test-demo.yaml
set TEST_MODE=true && set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/payments-test-demo.yaml

# Cloud DB (Supabase)
set TEST_MODE=true && set SWARM_MODE=deterministic && node orchestration/graph/runner.mjs orchestration/graph/projects/cloud-db-demo.yaml
set TEST_MODE=true && set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/cloud-db-demo.yaml

# Cloud TTS + video compose
set TEST_MODE=true && set SWARM_MODE=deterministic && node orchestration/graph/runner.mjs orchestration/graph/projects/tts-cloud-demo.yaml
set TEST_MODE=true && set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/tts-cloud-demo.yaml
````

Pass if (per demo):

- firecrawl: `runs/tenants/default/crawl_demo/urls.json`, `graph.json`
- stripe: `runs/tenants/default/payments_demo/payment_intent.json`, `charge.json`
- supabase: `runs/tenants/default/db_demo/connectivity.json`, `roundtrip.json`, `schema.json`
- tts-cloud: `runs/tenants/default/tts_cloud_demo/narration.wav`

Doc generation artifacts:

- SEO: `reports/seo/summary.md`, `summary.html` (data from `reports/seo/audit.json`)
- DB: `reports/db/summary.md`, `summary.html`
- Media: `reports/media/production_report.md`, `production_report.html`

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

## Phase 11 Domain Verification

### Data Domain — Insights Generation

**Goal:** Verify data ingestion and insights generation capabilities.

#### Verify Data Insights

```bash
# Run data ingest synthetic test
node tests/agents/synthetic/data.ingest.test.mjs

# Validate insights.json
node orchestration/lib/data_validator.mjs test-synthetic-data/insights.json

# Or with custom thresholds
node orchestration/lib/data_validator.mjs runs/<AUV>/data/insights.json --min-rows 100
```

**Pass if:**

- `insights.json` passes schema validation
- Row count meets minimum threshold (default: 10)
- At least 1 metric is generated
- Source file checksums match (if manifest present)

**Artifacts:**

- `runs/<AUV>/data/insights.json`
- `runs/<AUV>/data/raw/*.csv` (source files)

### Charts Domain — Visualization Validation

**Goal:** Verify chart generation and PNG integrity.

#### Verify Charts

```bash
# Validate all charts in a directory
node orchestration/lib/chart_validator.mjs runs/<AUV>/charts/

# Or validate specific chart
node orchestration/lib/chart_validator.mjs runs/<AUV>/charts/revenue_chart.png
```

**Pass if:**

- PNG files are valid format
- Dimensions within min/max bounds (400x300 to 2000x2000)
- Charts contain visual content (not blank)

**Artifacts:**

- `runs/<AUV>/charts/*.png`

### SEO Domain — Audit Validation

**Goal:** Verify SEO audit completeness and quality.

#### Verify SEO Audit

```bash
# Run SEO synthetic test
node tests/agents/synthetic/seo.audit.test.mjs

# Validate audit results
node orchestration/lib/seo_validator.mjs reports/seo/audit.json

# Or with custom thresholds
node orchestration/lib/seo_validator.mjs reports/seo/audit.json --max-broken-links 10
```

**Pass if:**

- `audit.json` passes schema validation
- Broken links ≤ threshold (default: 5)
- Canonical coverage ≥ 80%
- Has sitemap (if required)
- Page issues do not exceed configured `pageIssueFailRate` (default 0.9). To be stricter, set a lower rate per AUV or via `mcp/policies.yaml`.

**Artifacts:**

- `reports/seo/audit.json`
- `reports/seo/summary.md`

### Media Domain — Composition Validation

**Goal:** Verify audio/video composition pipeline.

#### Verify Media Composition

```bash
# Run video compose synthetic test
node tests/agents/synthetic/video.compose.test.mjs

# Validate composition metadata
node orchestration/lib/media_validator.mjs media/compose-metadata.json

# Or with custom tolerance
node orchestration/lib/media_validator.mjs media/compose-metadata.json --duration-tolerance 15
```

**Pass if:**

- Duration variance within tolerance (default: 10%)
- Video dimensions meet minimum (640x480)
- Audio track present (if required)
- All referenced files exist

**Artifacts:**

- `media/compose-metadata.json`
- `media/final.mp4`
- `media/narration.mp3`
- `media/script.txt`

### Database Domain — Migration Validation

**Goal:** Verify database migration execution and validation.

#### Verify DB Migration

```bash
# Run migration synthetic test
node tests/agents/synthetic/db.migration.test.mjs

# Validate migration result
node orchestration/lib/db_migration_validator.mjs db/migration-result.json

# Or with failure tolerance
node orchestration/lib/db_migration_validator.mjs db/migration-result.json --max-failed 1
```

**Pass if:**

- Migrations applied successfully
- Failed migrations ≤ threshold (default: 0)
- Validation queries pass (set `validation_required` to true in CI to enforce)
- Schema snapshot captured

**Artifacts:**

- `db/migration-result.json`
- `db/migrations/*.sql`

### Automated Domain Validation

Run CVF with automatic domain detection:

```bash
# Auto-detect and validate all domains for an AUV
node orchestration/cvf-check.mjs <AUV-ID> --strict

# Or specify domains explicitly
node orchestration/cvf-check.mjs <AUV-ID> --strict --domains data,charts,seo
```

**Exit Codes:**

- 305: Data validation failed
- 306: Charts validation failed
- 307: SEO audit failed
- 308: Media composition failed
- 309: Database migration failed

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
