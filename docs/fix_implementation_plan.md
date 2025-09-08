### Verification of issues in docs/problem.md

- 1) Missing `tests/robot/playwright/auv-0002-ui.spec.ts`: Accurate. It’s referenced in `capabilities/AUV-0002.yaml` but not committed; generation can create it, but committing an explicit spec avoids confusion and conflicts.
- 2) Screenshot capture order: Likely accurate if `tests/robot/playwright/products.spec.ts` takes both screenshots after navigation; that would produce two “detail” screenshots and fail CVF.
- 3) Sweep-line sort comparator: Not strictly a bug (start-before-end is respected with `b.d - a.d`), but we’ll switch to a clearer, less error-prone comparator to remove ambiguity.
- 4) Generated detail test not navigating back: Not required if we capture grid in one test and detail in a separate test. We’ll ensure we always capture grid before navigation and detail after navigation.

### Root cause summary

- AUV-0002 CVF mismatches stem from artifact filename drift and test flow order (grid vs detail) across specs.
- CI flakiness in graph parallelization was primarily from test design (short durations, server noise), not the runner; we’ll harden the test and comparator.

### Bulletproof plan and concrete implementation details

#### A) Commit explicit AUV‑0002 UI spec that produces both required screenshots deterministically

- Create `tests/robot/playwright/auv-0002-ui.spec.ts` that:
  - Captures `products_grid.png` on the grid before any navigation.
  - Navigates to a product detail page and captures `product_detail.png` there.

```ts
// tests/robot/playwright/auv-0002-ui.spec.ts
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const STAGING_URL = process.env.STAGING_URL;
const AUV_ID = process.env.AUV_ID || 'AUV-0002';
const OUT_DIR = path.resolve(process.cwd(), 'runs', AUV_ID, 'ui');

test.describe('AUV-0002 UI — grid and detail screenshots', () => {
  test.skip(!STAGING_URL, 'STAGING_URL env var not set');

  test('grid: renders grid and saves products_grid.png BEFORE navigation', async ({ page }) => {
    await page.goto(`${STAGING_URL}/products.html`);
    await page.waitForSelector('[data-testid="product-card"]');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(OUT_DIR, 'products_grid.png') });
  });

  test('detail: navigates and saves product_detail.png AFTER navigation', async ({ page }) => {
    await page.goto(`${STAGING_URL}/products.html`);
    await page.waitForSelector('[data-testid="product-card"]');
    await page.locator('[data-testid="product-card"]').first().click();
    await page.waitForSelector('[data-testid="product-detail-title"]');
    await page.waitForSelector('[data-testid="product-detail-price"]');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(OUT_DIR, 'product_detail.png') });
  });
});
```

- Ensure `capabilities/AUV-0002.yaml` continues to point to this spec under `tests.playwright`. We already added:
  - `artifacts.required` with the exact filenames.
  - `authoring_hints.ui` matching these names for generator parity.
- Important: Do not include the autogen banner in this committed spec; `ensureTests()` will not overwrite it.

#### B) Avoid conflicts with any existing generic products spec

- If `tests/robot/playwright/products.spec.ts` exists and also writes `products_grid.png` / `product_detail.png`, either:
  - Remove those outputs, or
  - Guard them to skip when `AUV_ID === 'AUV-0002'`, or
  - Rename them to non-conflicting filenames (e.g., `products_grid_legacy.png`).

Example edit (guard and rename):

```ts
// tests/robot/playwright/products.spec.ts
// Pseudopatch: ensure this spec does NOT write AUV-0002 artifacts
const AUV_ID = process.env.AUV_ID;
const isAUV0002 = AUV_ID === 'AUV-0002';

// ... in the grid test:
if (!isAUV0002) {
  await page.screenshot({ path: path.join(dir, 'products_grid_legacy.png') });
}

// ... in the detail test:
if (!isAUV0002) {
  await page.screenshot({ path: path.join(dir, 'product_detail_legacy.png') });
}
```

- This prevents double-writes and preserves legacy behavior for other scenarios.

#### C) Keep YAML-first CVF alignment and prevent drift

- Already done: `orchestration/lib/expected_artifacts.mjs` prefers `capabilities/<AUV>.yaml` → `artifacts.required`.
- Add a small unit test to assert AUV-0002’s artifact names are as expected (fast fail if someone changes filenames):

```js
// tests/unit/auv-0002-artifacts.test.mjs
import fs from 'fs';
import YAML from 'yaml';

const spec = YAML.parse(fs.readFileSync('capabilities/AUV-0002.yaml', 'utf8'));
const required = spec?.artifacts?.required || [];

if (!Array.isArray(required)) throw new Error('artifacts.required missing');
const expected = new Set([
  'runs/AUV-0002/ui/products_grid.png',
  'runs/AUV-0002/ui/product_detail.png',
  'runs/AUV-0002/perf/lighthouse.json',
]);

for (const f of expected) {
  if (!required.includes(f)) throw new Error(`Missing expected artifact: ${f}`);
}
```

#### D) Harden the graph parallelization integration test further

- Keep no-server design and longer CI duration (≥1000ms) to overpower jitter.
- Replace the sort comparator with an explicit and clear form; compute max concurrency with sweep-line on intervals.

```diff
- events.sort((a, b) => a.t - b.t || b.d - a.d); // start before end at same t
+ events.sort((a, b) => {
+   if (a.t !== b.t) return a.t - b.t;
+   // start (+1) before end (-1) at same timestamp
+   if (a.d === b.d) return 0;
+   return a.d > b.d ? -1 : 1;
+});
```

- Optionally allow override via `GRAPH_TEST_MS` env var for local tuning:
  - `const WORK_DURATION_MS = process.env.GRAPH_TEST_MS ? +process.env.GRAPH_TEST_MS : (isCI ? 1000 : 400);`

#### E) CI hygiene and guardrails

- For AUV-0002 autopilot step:
  - Ensure only the explicit specs run (already the case: CLI passes exact spec files).
  - Clear `runs/AUV-0002/ui/` before the run to avoid stale screenshots interfering with CVF:
    - `rm -rf runs/AUV-0002/ui || true` (Linux) or use Node in a script for cross-platform in CI.
- Do not set `FORCE_REGEN=1` for AUV-0002 in CI (we’re committing the spec). The generator will not overwrite non-autogen files.
- Keep YAML-first CVF artifacts and the strict CVF gate as-is.

#### F) Conventional commits

- feat(tests): add committed AUV-0002 UI spec capturing grid-before-click and detail-after-click
- fix(tests): guard legacy products.spec from writing AUV-0002 artifact filenames
- fix(cvf): prefer YAML artifacts.required to avoid drift
- fix(int): stabilize graph parallelization test and clarify event sorting comparator
- test(unit): assert AUV-0002 artifact filenames in capability YAML

### Validation checklist

- Autopilot AUV‑0002: green
  - node orchestration/cli.mjs AUV-0002
  - node orchestration/cvf-check.mjs AUV-0002 --strict
- Integration (graph):
  - node --test tests/integration/graph-parallelization.test.mjs
- Unit:
  - node --test tests/unit/auv-0002-artifacts.test.mjs

- **Outcome**: Deterministic screenshots (grid and detail) for AUV‑0002, CVF aligned to YAML, no duplicate writers, stable graph test passing in CI.
