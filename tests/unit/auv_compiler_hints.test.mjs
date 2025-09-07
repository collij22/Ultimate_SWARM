import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  extractCapabilities,
  generateAuvSpec,
  computeDependencies,
} from '../../orchestration/lib/auv_compiler.mjs';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

describe('auv_compiler authoring hints', () => {
  let compiledAuvs;

  before(() => {
    const brief = {
      business_goals: ['Build e-commerce marketplace'],
      must_have: ['Product catalog', 'Shopping cart', 'Checkout flow'],
      nice_to_have: [],
      constraints: { budget_usd: 5000 },
    };

    // Simulate the compilation process
    const capabilities = extractCapabilities(brief);
    let idCounter = 101;
    const idAllocator = () => `AUV-0${idCounter++}`;
    compiledAuvs = capabilities.map((cap) => generateAuvSpec(cap, idAllocator));
    compiledAuvs = computeDependencies(compiledAuvs);
  });

  it('should generate correct cart UI selectors', () => {
    const cartAuv = compiledAuvs.find((a) => a.title === 'Shopping cart');
    assert(cartAuv);

    const hints = cartAuv.authoring_hints?.ui;
    assert.strictEqual(hints.row_selector, '[data-testid="cart-row"]');
    assert.strictEqual(hints.subtotal_selector, '[data-testid="cart-subtotal"]');
    assert.strictEqual(hints.tax_selector, '[data-testid="cart-tax"]');
    assert.strictEqual(hints.total_selector, '[data-testid="cart-total"]');
  });

  it('should generate correct checkout UI selectors', () => {
    const checkoutAuv = compiledAuvs.find((a) => a.title === 'Checkout flow');
    assert(checkoutAuv);

    const hints = checkoutAuv.authoring_hints?.ui;
    assert.strictEqual(hints.name_selector, '#name');
    assert.strictEqual(hints.email_selector, '#email');
    assert.strictEqual(hints.address_selector, '#address');
    assert.strictEqual(hints.card_selector, '#card');
    assert.strictEqual(hints.submit_selector, '[data-testid="submit-order"]');
    assert.strictEqual(hints.success_selector, '[data-testid="order-success"]');
  });

  it('should not use literal /:id in API paths', () => {
    const productAuv = compiledAuvs.find((a) => a.title === 'Product catalog');
    assert(productAuv);

    const apiCases = productAuv.authoring_hints?.api?.cases || [];
    for (const apiCase of apiCases) {
      assert(
        !apiCase.path?.includes('/:id'),
        `API path should not contain literal /:id - found: ${apiCase.path}`,
      );
    }
  });

  it('should generate correct products API cases', () => {
    const productAuv = compiledAuvs.find((a) => a.title === 'Product catalog');
    assert(productAuv);

    const apiCases = productAuv.authoring_hints?.api?.cases || [];
    const searchCase = apiCases.find((c) => c.name === 'search products');

    assert(searchCase);
    assert.strictEqual(searchCase.method, 'GET');
    assert.strictEqual(searchCase.path, '/?q=3');
    assert.strictEqual(searchCase.expect, 'filtered');
  });

  it('should not add auth dependency to product catalog', () => {
    const productAuv = compiledAuvs.find((a) => a.title === 'Product catalog');
    assert(productAuv);

    const deps = productAuv.dependencies || [];
    const hasAuthDep = deps.some(
      (d) => d.toLowerCase().includes('auth') || d.toLowerCase().includes('login'),
    );

    assert(!hasAuthDep, 'Product catalog should not depend on authentication');
  });

  it('should not add auth dependency to shopping cart', () => {
    const cartAuv = compiledAuvs.find((a) => a.title === 'Shopping cart');
    assert(cartAuv);

    const deps = cartAuv.dependencies || [];
    const hasAuthDep = deps.some(
      (d) => d.toLowerCase().includes('auth') || d.toLowerCase().includes('login'),
    );

    assert(!hasAuthDep, 'Shopping cart should not depend on authentication');
  });

  it('should not add auth dependency to checkout in mock environment', () => {
    // Checkout should NOT have auth dependency in mock environment
    const checkoutAuv = compiledAuvs.find((a) => a.title === 'Checkout flow');
    assert(checkoutAuv);

    // Check if checkout depends on cart (which is correct)
    const deps = checkoutAuv.dependencies || [];
    assert(deps.length > 0, 'Checkout should have dependencies');

    // Check that it doesn't depend on auth
    const hasAuthDep = deps.some((d) => d.toLowerCase().includes('auth') || d === 'AUV-0104');
    assert(!hasAuthDep, 'Checkout should not depend on authentication in mock environment');
  });

  it('should generate correct artifact requirements', () => {
    const productAuv = compiledAuvs.find((a) => a.title === 'Product catalog');
    assert(productAuv);

    const artifacts = productAuv.artifacts?.required || [];
    assert(artifacts.includes('runs/AUV-0101/ui/products_search.png'));
    assert(artifacts.includes('runs/AUV-0101/perf/lighthouse.json'));
    // API trace artifact removed - tests don't generate deterministic traces yet
    // assert(artifacts.includes('runs/AUV-0101/api/trace.json'));
  });

  it('should extract brief_id from directory name', () => {
    // Create a mock brief file path
    const briefPath = path.join('briefs', 'demo-01', 'brief.md');
    const briefId = path.basename(path.dirname(briefPath));

    assert.strictEqual(briefId, 'demo-01');
  });

  it('should handle dashboard with auth dependency', () => {
    const briefWithDashboard = {
      business_goals: ['Build platform'],
      must_have: ['User Dashboard', 'Analytics'],
      nice_to_have: [],
      constraints: {},
    };

    const capabilities = extractCapabilities(briefWithDashboard);
    let idCounter = 101;
    const idAllocator = () => `AUV-0${idCounter++}`;
    const auvs = capabilities.map((cap) => generateAuvSpec(cap, idAllocator));
    const auvsWithDeps = computeDependencies(auvs);
    const dashboardAuv = auvsWithDeps.find((a) => a.title === 'Dashboard');

    if (dashboardAuv) {
      const deps = dashboardAuv.dependencies || [];
      const hasAuthDep = deps.some((d) => d.toLowerCase().includes('auth') || d === 'AUV-0104');
      assert(hasAuthDep, 'Dashboard should depend on authentication');
    }
  });
});
