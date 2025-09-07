import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import crypto from 'crypto';
import { parseBriefFile, validateBrief } from './validate_brief.mjs';
import { invokeRequirementsAnalyst } from './call_agent.mjs';

/**
 * Parse a brief file and return structured data
 * @param {string} briefPath - Path to the brief file
 * @returns {object} Parsed and validated brief
 */
export async function parseBrief(briefPath) {
  const briefData = parseBriefFile(briefPath);
  const validation = validateBrief(briefData);

  if (!validation.valid) {
    throw new Error(`Brief validation failed: ${validation.errors.join(', ')}`);
  }

  return validation.data;
}

/**
 * Extract capabilities from brief or requirements
 * @param {object} input - Brief object or requirements object
 * @returns {object[]} List of capability records
 */
export function extractCapabilities(input) {
  // If input has capabilities array, it's already requirements
  if (input.capabilities) {
    return input.capabilities.map((cap) => ({
      ...cap,
      owner: cap.type || 'web',
      hints: generateAuthoringHints(cap),
    }));
  }

  // Otherwise, extract from brief
  const capabilities = [];
  let capId = 1;

  // Process must-have features
  if (input.must_have) {
    input.must_have.forEach((feature) => {
      const cap = createCapabilityFromFeature(feature, 'must_have', capId++);
      capabilities.push(cap);
    });
  }

  // Process nice-to-have features
  if (input.nice_to_have) {
    input.nice_to_have.forEach((feature) => {
      const cap = createCapabilityFromFeature(feature, 'nice_to_have', capId++);
      capabilities.push(cap);
    });
  }

  return capabilities;
}

/**
 * Create a capability from a feature description
 * @param {string} feature - Feature description
 * @param {string} priority - Priority level
 * @param {number} id - Capability ID number
 * @returns {object} Capability object
 */
function createCapabilityFromFeature(feature, priority, id) {
  const featureLower = feature.toLowerCase();

  // Determine type/owner
  let type = 'web';
  if (
    featureLower.includes('api') ||
    featureLower.includes('endpoint') ||
    featureLower.includes('service')
  ) {
    type = 'api';
  } else if (
    featureLower.includes('database') ||
    featureLower.includes('data') ||
    featureLower.includes('etl')
  ) {
    type = 'data';
  } else if (
    featureLower.includes('ai') ||
    featureLower.includes('ml') ||
    featureLower.includes('model')
  ) {
    type = 'ai';
  }

  // Clean name
  let name = feature.split(/[,.:]/)[0].trim();
  if (name.length > 50) {
    name = name.substring(0, 47) + '...';
  }

  const capability = {
    id: `CAP-${String(id).padStart(3, '0')}`,
    name,
    type,
    owner: type,
    priority,
    description: feature,
    acceptance_criteria: generateAcceptanceCriteria(feature),
    risks: [],
  };

  capability.hints = generateAuthoringHints(capability);

  return capability;
}

/**
 * Generate acceptance criteria from feature
 * @param {string} feature - Feature description
 * @returns {string[]} Acceptance criteria
 */
function generateAcceptanceCriteria(feature) {
  const criteria = [];
  const featureLower = feature.toLowerCase();

  // Product catalog patterns
  if (featureLower.includes('catalog') || featureLower.includes('product')) {
    criteria.push('Products displayed in grid or list view');
    criteria.push('Product details page shows all information');
    criteria.push('Navigation between products works smoothly');
    if (featureLower.includes('search')) {
      criteria.push('Search returns relevant results');
      criteria.push('Search completes within 2 seconds');
    }
    if (featureLower.includes('filter')) {
      criteria.push('Filters update results without page reload');
      criteria.push('Multiple filters can be combined');
    }
  }

  // Shopping cart patterns
  else if (featureLower.includes('cart') || featureLower.includes('basket')) {
    criteria.push('Items can be added to cart');
    criteria.push('Items can be removed from cart');
    criteria.push('Quantities can be updated');
    criteria.push('Cart totals calculate correctly including tax');
    criteria.push('Cart persists across page refreshes');
  }

  // Checkout patterns
  else if (featureLower.includes('checkout') || featureLower.includes('payment')) {
    criteria.push('Guest checkout option available');
    criteria.push('Form validation works correctly');
    criteria.push('Payment information processed securely');
    criteria.push('Order confirmation displayed');
    criteria.push('Confirmation email sent');
  }

  // Dashboard patterns
  else if (featureLower.includes('dashboard')) {
    criteria.push('Key metrics displayed prominently');
    criteria.push('Data refreshes automatically');
    criteria.push('Charts and visualizations render correctly');
    criteria.push('Responsive layout on all devices');
    criteria.push('Export functionality available');
  }

  // Authentication patterns
  else if (
    featureLower.includes('auth') ||
    featureLower.includes('login') ||
    featureLower.includes('signup')
  ) {
    criteria.push('User registration with email verification');
    criteria.push('Secure login and logout');
    criteria.push('Password reset functionality');
    criteria.push('Session management works correctly');
    criteria.push('Remember me option available');
  }

  // Vendor/seller patterns
  else if (featureLower.includes('vendor') || featureLower.includes('seller')) {
    criteria.push('Vendor registration and profile creation');
    criteria.push('Product listing management');
    criteria.push('Order management dashboard');
    criteria.push('Analytics and reporting');
  }

  // API patterns
  else if (featureLower.includes('api') || featureLower.includes('endpoint')) {
    criteria.push('RESTful endpoints follow conventions');
    criteria.push('Authentication and authorization');
    criteria.push('Input validation and error handling');
    criteria.push('Response format consistent');
    criteria.push('Rate limiting implemented');
  }

  // Default criteria
  else {
    criteria.push('Feature works as specified');
    criteria.push('Error cases handled gracefully');
    criteria.push('Performance meets requirements');
    criteria.push('User experience is intuitive');
  }

  return criteria.slice(0, 5); // Limit to 5 criteria
}

/**
 * Generate authoring hints for a capability
 * @param {object} capability - Capability object
 * @returns {object} Authoring hints
 */
function generateAuthoringHints(capability) {
  const hints = {
    ui: {},
    api: {},
  };

  const nameLower = capability.name.toLowerCase();

  // UI hints based on capability type
  if (capability.type === 'web' || capability.owner === 'web') {
    // Product catalog hints
    if (nameLower.includes('catalog') || nameLower.includes('product')) {
      hints.ui = {
        page: '/products.html',
        search_input: '#q',
        min_price_input: '#minPrice',
        max_price_input: '#maxPrice',
        apply_button_text: 'Apply',
        card_selector: '[data-testid="product-card"]',
        title_selector: '[data-testid="product-title"]',
        price_selector: '[data-testid="product-price"]',
        screenshot: 'products_search.png',
      };

      // Let API defaults (list + id) be generated by test_authoring; avoid '/:id' literal
      hints.api = {
        base_path: '/products',
        cases: [
          { name: 'list products', method: 'GET', path: '/', expect: 'array' },
          { name: 'search products', method: 'GET', path: '/?q=3', expect: 'filtered' },
        ],
      };
    }

    // Shopping cart hints
    else if (nameLower.includes('cart') || nameLower.includes('basket')) {
      hints.ui = {
        page: '/cart.html',
        row_selector: '[data-testid="cart-row"]',
        subtotal_selector: '[data-testid="cart-subtotal"]',
        tax_selector: '[data-testid="cart-tax"]',
        total_selector: '[data-testid="cart-total"]',
        screenshot: 'cart_summary.png',
      };

      // Use setup + summary_path so test_authoring seeds cart before assertions
      hints.api = {
        base_path: '/cart',
        cases: [
          {
            name: 'summary after setup',
            method: 'GET',
            summary_path: '/cart/summary',
            setup: [{ method: 'POST', path: '/api/cart', body: { productId: 'demo-1', qty: 1 } }],
          },
        ],
      };
    }

    // Checkout hints
    else if (nameLower.includes('checkout')) {
      hints.ui = {
        page: '/checkout.html',
        name_selector: '#name',
        email_selector: '#email',
        address_selector: '#address',
        card_selector: '#card',
        submit_selector: '[data-testid="submit-order"]',
        success_selector: '[data-testid="order-success"]',
        screenshot: 'checkout_flow.png',
      };

      // Only known endpoint is POST /api/checkout → 201
      hints.api = {
        base_path: '/checkout',
        cases: [{ name: 'submit order', method: 'POST', path: '/', expect_status: 201 }],
      };
    }

    // Dashboard hints
    else if (nameLower.includes('dashboard')) {
      hints.ui = {
        page: '/dashboard.html',
        card_selector: '[data-testid="metric-card"]',
        title_selector: '[data-testid="metric-title"]',
        value_selector: '[data-testid="metric-value"]',
        screenshot: 'dashboard_overview.png',
      };

      hints.api = {
        base_path: '/dashboard',
        cases: [
          { name: 'get metrics', method: 'GET', path: '/metrics', expect: 'metrics' },
          { name: 'get charts', method: 'GET', path: '/charts', expect: 'chart_data' },
        ],
      };
    }

    // Authentication hints
    else if (nameLower.includes('auth') || nameLower.includes('login')) {
      hints.ui = {
        page: '/login.html',
        email_selector: '#email',
        password_selector: '#password',
        submit_selector: '[data-testid="login-button"]',
        success_selector: '[data-testid="user-menu"]',
        screenshot: 'auth_flow.png',
      };

      hints.api = {
        base_path: '/auth',
        cases: [
          { name: 'login', method: 'POST', path: '/login', expect: 'token' },
          { name: 'logout', method: 'POST', path: '/logout', expect: 'success' },
          { name: 'register', method: 'POST', path: '/register', expect: 'user_id' },
        ],
      };
    }

    // Default web hints
    else {
      const featureName = nameLower.replace(/[^a-z0-9]/g, '_');
      hints.ui = {
        page: `/${featureName}.html`,
        card_selector: '[data-testid="item"]',
        title_selector: '[data-testid="title"]',
        screenshot: `${featureName}.png`,
      };
    }
  }

  // API-specific hints
  if (capability.type === 'api' || capability.owner === 'api') {
    if (!hints.api.base_path) {
      const apiName = nameLower.replace(/[^a-z0-9]/g, '-');
      hints.api = {
        base_path: `/${apiName}`,
        cases: [
          { name: 'list', method: 'GET', path: '/', expect: 'array' },
          { name: 'get', method: 'GET', path: '/:id', expect: 'object' },
          { name: 'create', method: 'POST', path: '/', expect: 'created' },
          { name: 'update', method: 'PUT', path: '/:id', expect: 'updated' },
          { name: 'delete', method: 'DELETE', path: '/:id', expect: 'deleted' },
        ],
      };
    }
  }

  return hints;
}

/**
 * Generate an AUV spec from a capability
 * @param {object} capability - Capability object
 * @param {function} idAllocator - Function to get next AUV ID
 * @returns {object} AUV specification
 */
export function generateAuvSpec(capability, idAllocator) {
  const auvId = idAllocator();

  const auv = {
    id: auvId,
    title: capability.name,
    owner: capability.owner || 'web',
    status: 'pending',
    tags: generateTags(capability),

    acceptance: {
      summary: capability.description || capability.name,
      criteria: capability.acceptance_criteria || [],
    },

    tests: {
      playwright: [`tests/robot/playwright/${auvId.toLowerCase()}.spec.ts`],
    },

    artifacts: {
      required: [
        `runs/${auvId}/ui/${capability.hints?.ui?.screenshot || 'screenshot.png'}`,
        `runs/${auvId}/perf/lighthouse.json`,
      ],
    },

    authoring_hints: capability.hints || {},

    dependencies: [],

    estimates: estimateBudget({
      name: capability.name,
      type: capability.type,
      acceptance_criteria: capability.acceptance_criteria,
      priority: capability.priority,
    }),
  };

  // Add API tests if applicable
  if (capability.hints?.api?.cases?.length > 0) {
    auv.tests.api = [`tests/robot/playwright/api/${auvId.toLowerCase()}.spec.ts`];
    // API trace artifact removed - tests don't generate deterministic traces yet
    // auv.artifacts.required.push(`runs/${auvId}/api/trace.json`);
  }

  return auv;
}

/**
 * Generate tags for an AUV based on capability
 * @param {object} capability - Capability object
 * @returns {string[]} Tags
 */
function generateTags(capability) {
  const tags = [];

  // Add type tag
  if (capability.type) tags.push(capability.type);

  // Add feature tags based on name/description
  const text = `${capability.name} ${capability.description || ''}`.toLowerCase();

  if (text.includes('ui') || text.includes('interface') || text.includes('frontend')) {
    tags.push('ui');
  }
  if (text.includes('api') || text.includes('endpoint') || text.includes('service')) {
    tags.push('api');
  }
  if (text.includes('product')) tags.push('products');
  if (text.includes('cart')) tags.push('cart');
  if (text.includes('checkout')) tags.push('checkout');
  if (text.includes('payment')) tags.push('payment');
  if (text.includes('auth')) tags.push('auth');
  if (text.includes('dashboard')) tags.push('dashboard');
  if (text.includes('search')) tags.push('search');
  if (text.includes('filter')) tags.push('filter');
  if (text.includes('data')) tags.push('data');
  if (text.includes('admin')) tags.push('admin');

  return [...new Set(tags)]; // Unique tags
}

/**
 * Compute dependencies between AUVs
 * @param {object[]} auvs - List of AUV specs
 * @returns {object[]} AUVs with dependencies populated
 */
export function computeDependencies(auvs) {
  auvs.forEach((auv, index) => {
    const deps = [];

    // UI depends on API
    if (auv.owner === 'web' && auv.tags.includes('ui')) {
      // Find corresponding API AUV
      const apiAuv = auvs.find(
        (a, i) =>
          i < index &&
          (a.owner === 'api' || a.tags.includes('api')) &&
          hasRelatedFunctionality(auv, a),
      );
      if (apiAuv) deps.push(apiAuv.id);
    }

    // Checkout depends on cart
    if (auv.title.toLowerCase().includes('checkout')) {
      const cartAuv = auvs.find((a) => a.id !== auv.id && a.title.toLowerCase().includes('cart'));
      if (cartAuv) deps.push(cartAuv.id);
    }

    // Cart depends on products
    if (auv.title.toLowerCase().includes('cart')) {
      const productAuv = auvs.find(
        (a) =>
          a.id !== auv.id &&
          (a.title.toLowerCase().includes('product') || a.title.toLowerCase().includes('catalog')),
      );
      if (productAuv) deps.push(productAuv.id);
    }

    // Auth dependency only for protected areas (profile, vendor/admin, dashboard)
    // Note: checkout is open in mock environment, no auth required
    const authAuv = auvs.find(
      (a) => a.title.toLowerCase().includes('auth') || a.title.toLowerCase().includes('login'),
    );
    const needsAuth = /profile|vendor|seller|dashboard|order/.test(auv.title.toLowerCase());
    if (authAuv && needsAuth && authAuv.id !== auv.id) {
      if (!deps.includes(authAuv.id)) deps.push(authAuv.id);
    }

    // Data consumers depend on data creators
    if (auv.tags.includes('dashboard') || auv.tags.includes('report')) {
      const dataAuv = auvs.find((a, i) => i < index && a.tags.includes('data'));
      if (dataAuv) deps.push(dataAuv.id);
    }

    auv.dependencies = [...new Set(deps)]; // Unique dependencies
  });

  // Detect and break cycles
  const hasCycle = detectCycles(auvs);
  if (hasCycle) {
    console.warn('[compiler] Dependency cycle detected, flattening some dependencies');
    // Simple cycle breaking: remove back-edges
    auvs.forEach((auv, index) => {
      auv.dependencies = auv.dependencies.filter((depId) => {
        const depIndex = auvs.findIndex((a) => a.id === depId);
        return depIndex < index; // Only depend on earlier AUVs
      });
    });
  }

  return auvs;
}

/**
 * Check if two AUVs have related functionality
 * @param {object} auv1 - First AUV
 * @param {object} auv2 - Second AUV
 * @returns {boolean} True if related
 */
function hasRelatedFunctionality(auv1, auv2) {
  // Check for common tags
  const commonTags = auv1.tags.filter((t) => auv2.tags.includes(t));
  if (commonTags.length > 0) return true;

  // Check for name similarity
  const name1Words = auv1.title.toLowerCase().split(/\s+/);
  const name2Words = auv2.title.toLowerCase().split(/\s+/);
  const commonWords = name1Words.filter((w) => name2Words.includes(w) && w.length > 3);

  return commonWords.length > 0;
}

/**
 * Detect cycles in dependency graph
 * @param {object[]} auvs - List of AUVs with dependencies
 * @returns {boolean} True if cycle detected
 */
function detectCycles(auvs) {
  const visited = new Set();
  const recursionStack = new Set();

  function hasCycleDFS(auvId) {
    if (recursionStack.has(auvId)) return true;
    if (visited.has(auvId)) return false;

    visited.add(auvId);
    recursionStack.add(auvId);

    const auv = auvs.find((a) => a.id === auvId);
    if (auv && auv.dependencies) {
      for (const depId of auv.dependencies) {
        if (hasCycleDFS(depId)) return true;
      }
    }

    recursionStack.delete(auvId);
    return false;
  }

  for (const auv of auvs) {
    if (hasCycleDFS(auv.id)) return true;
  }

  return false;
}

/**
 * Estimate budget for an AUV
 * @param {object} auv - AUV or capability object
 * @returns {object} Budget estimates
 */
export function estimateBudget(auv) {
  let complexity = 1;

  // Type-based complexity
  const type = auv.type || auv.owner || 'web';
  switch (type) {
    case 'web':
      complexity += 2;
      break;
    case 'api':
      complexity += 2;
      break;
    case 'data':
      complexity += 3;
      break;
    case 'ai':
      complexity += 4;
      break;
  }

  // Feature complexity
  const nameLower = (auv.name || auv.title || '').toLowerCase();
  if (nameLower.includes('auth') || nameLower.includes('security')) complexity += 2;
  if (nameLower.includes('payment') || nameLower.includes('checkout')) complexity += 3;
  if (nameLower.includes('real-time') || nameLower.includes('realtime')) complexity += 2;
  if (nameLower.includes('integration')) complexity += 2;
  if (nameLower.includes('dashboard') || nameLower.includes('analytics')) complexity += 2;
  if (nameLower.includes('migration') || nameLower.includes('import')) complexity += 2;

  // Acceptance criteria count
  const criteriaCount = auv.acceptance_criteria?.length || auv.acceptance?.criteria?.length || 3;
  complexity += Math.floor(criteriaCount / 3);

  // Priority adjustment
  if (auv.priority === 'nice_to_have') {
    complexity = Math.max(1, complexity - 1);
  }

  complexity = Math.min(complexity, 10);

  // Calculate estimates with 20% buffer
  const baseHours = complexity * 3;
  const timeHours = Math.ceil(baseHours * 1.2);

  const baseTokens = complexity * 15000;
  const tokens = Math.ceil(baseTokens * 1.2);

  const baseMcp = complexity * 0.03;
  const mcpUsd = Math.round(baseMcp * 1.2 * 100) / 100;

  return {
    complexity,
    tokens,
    mcp_usd: mcpUsd,
    time_hours: timeHours,
  };
}

/**
 * Write backlog file
 * @param {object[]} auvs - List of AUV specs
 * @param {string} briefId - Brief identifier
 * @returns {string} Path to backlog file
 */
export async function writeBacklog(auvs, briefId = 'unknown') {
  const backlogPath = path.join(process.cwd(), 'capabilities/backlog.yaml');

  // Calculate totals
  const totals = auvs.reduce(
    (acc, auv) => {
      acc.tokens += auv.estimates.tokens;
      acc.mcp_usd += auv.estimates.mcp_usd;
      acc.time_hours += auv.estimates.time_hours;
      return acc;
    },
    { tokens: 0, mcp_usd: 0, time_hours: 0 },
  );

  // Round totals
  totals.mcp_usd = Math.round(totals.mcp_usd * 100) / 100;

  const backlog = {
    version: '1.0',
    generated: new Date().toISOString().split('T')[0],
    brief_id: briefId,
    total_estimates: totals,
    backlog: auvs.map((auv, index) => ({
      id: auv.id,
      title: auv.title,
      priority: index < 3 ? 1 : 2, // First 3 are priority 1
      depends_on: auv.dependencies || [],
      status: 'pending',
      owner: auv.owner,
      estimates: {
        complexity: auv.estimates.complexity,
        tokens: auv.estimates.tokens,
        mcp_usd: auv.estimates.mcp_usd,
        time_hours: auv.estimates.time_hours,
      },
    })),
  };

  // Write with idempotent pattern
  const content = YAML.stringify(backlog, {
    lineWidth: 120,
    minContentWidth: 80,
  });

  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const header = `# Swarm1 AUV Backlog\n# Generated from brief: ${briefId}\n# Hash: ${hash}\n\n`;

  fs.writeFileSync(backlogPath, header + content, 'utf8');

  logHook('BacklogWritten', {
    path: backlogPath,
    briefId,
    auvCount: auvs.length,
    totalHours: totals.time_hours,
    totalCost: totals.mcp_usd,
  });

  return backlogPath;
}

/**
 * Write AUV spec file
 * @param {object} auv - AUV specification
 * @returns {string} Path to AUV file
 */
export function writeAuvSpec(auv) {
  const auvPath = path.join(process.cwd(), `capabilities/${auv.id}.yaml`);

  const content = YAML.stringify(auv, {
    lineWidth: 120,
    minContentWidth: 80,
  });

  // Use writeIfDifferent pattern
  if (fs.existsSync(auvPath)) {
    const existing = fs.readFileSync(auvPath, 'utf8');
    if (existing === content) {
      return auvPath; // No change needed
    }
  }

  fs.writeFileSync(auvPath, content, 'utf8');

  logHook('AuvSpecWritten', {
    path: auvPath,
    id: auv.id,
    title: auv.title,
    complexity: auv.estimates.complexity,
  });

  return auvPath;
}

/**
 * Full compilation pipeline
 * @param {string} briefPath - Path to brief file
 * @param {object} options - Options { dryRun: boolean }
 * @returns {object} Compilation result
 */
export async function compileBrief(briefPath, options = {}) {
  logHook('CompilationStart', { briefPath, dryRun: options.dryRun });

  // Step 1: Parse and validate brief
  const brief = await parseBrief(briefPath);
  const dirName = path.basename(path.dirname(briefPath));
  const fileBase = path.basename(briefPath, path.extname(briefPath));
  const briefId = dirName && dirName !== '.' ? dirName : fileBase;

  // Step 2: Extract requirements
  const requirements = await invokeRequirementsAnalyst(briefPath, options);

  // Step 3: Extract capabilities
  const capabilities = extractCapabilities(requirements);

  // Step 4: Generate AUVs
  let auvCounter = 101; // Start at 0101
  const idAllocator = () => `AUV-${String(auvCounter++).padStart(4, '0')}`;

  const auvs = capabilities.map((cap) => generateAuvSpec(cap, idAllocator));

  // Step 5: Compute dependencies
  computeDependencies(auvs);

  // Step 6: Write AUV files
  const auvPaths = auvs.map((auv) => writeAuvSpec(auv));

  // Step 7: Write backlog
  const backlogPath = await writeBacklog(auvs, briefId);

  logHook('CompilationComplete', {
    briefId,
    auvCount: auvs.length,
    backlogPath,
    firstAuv: auvs[0]?.id,
  });

  return {
    brief,
    requirements,
    auvs,
    auvPaths,
    backlogPath,
    summary: {
      auvCount: auvs.length,
      totalComplexity: auvs.reduce((sum, a) => sum + a.estimates.complexity, 0),
      totalHours: auvs.reduce((sum, a) => sum + a.estimates.time_hours, 0),
      totalCost: auvs.reduce((sum, a) => sum + a.estimates.mcp_usd, 0),
    },
  };
}

/**
 * Validate an AUV spec
 * @param {string} auvId - AUV identifier
 * @returns {object} Validation result
 */
export function validateAuv(auvId) {
  const auvPath = path.join(process.cwd(), `capabilities/${auvId}.yaml`);

  if (!fs.existsSync(auvPath)) {
    return {
      valid: false,
      errors: [`AUV file not found: ${auvPath}`],
    };
  }

  try {
    const content = fs.readFileSync(auvPath, 'utf8');
    const auv = YAML.parse(content);

    const errors = [];

    // Check required fields
    if (!auv.id) errors.push('Missing id field');
    if (!auv.title) errors.push('Missing title field');
    if (!auv.owner) errors.push('Missing owner field');
    if (!auv.acceptance?.summary) errors.push('Missing acceptance summary');
    if (!auv.acceptance?.criteria || auv.acceptance.criteria.length === 0) {
      errors.push('Missing or empty acceptance criteria');
    }

    // Check authoring hints
    if (!auv.authoring_hints) {
      errors.push('Missing authoring hints');
    } else {
      if (auv.owner === 'web' && !auv.authoring_hints.ui?.page) {
        errors.push('Missing UI page hint for web AUV');
      }
      if (auv.tags?.includes('api') && !auv.authoring_hints.api?.base_path) {
        errors.push('Missing API base_path hint');
      }
    }

    // Check for circular dependencies
    if (auv.dependencies?.includes(auv.id)) {
      errors.push('AUV has self-dependency');
    }

    return {
      valid: errors.length === 0,
      errors,
      data: errors.length === 0 ? auv : null,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to parse AUV: ${error.message}`],
    };
  }
}

/**
 * Log an event to hooks
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function logHook(event, data) {
  const hookPath = path.join(process.cwd(), 'runs/observability/hooks.jsonl');
  const hookDir = path.dirname(hookPath);

  if (!fs.existsSync(hookDir)) {
    fs.mkdirSync(hookDir, { recursive: true });
  }

  const entry = {
    ts: Date.now() / 1000,
    event,
    module: 'auv_compiler',
    ...data,
  };

  fs.appendFileSync(hookPath, JSON.stringify(entry) + '\n', 'utf8');
}

export default {
  parseBrief,
  extractCapabilities,
  generateAuvSpec,
  computeDependencies,
  estimateBudget,
  writeBacklog,
  writeAuvSpec,
  compileBrief,
  validateAuv,
};
