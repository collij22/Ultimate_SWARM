import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Invoke the Requirements Analyst agent to analyze a brief
 * @param {string} briefPath - Path to the brief file
 * @param {object} options - Options { dryRun: boolean }
 * @returns {object} Structured requirements analysis
 */
export async function invokeRequirementsAnalyst(briefPath, options = {}) {
  const briefContent = fs.readFileSync(briefPath, 'utf8');
  const runId = `REQ-${Date.now()}`;

  logHook('RequirementsAnalysisStart', { briefPath, runId, dryRun: options.dryRun });

  let requirements;

  if (options.dryRun) {
    // Use heuristic extraction for dry-run mode
    requirements = await extractRequirementsHeuristic(briefContent, briefPath);
  } else {
    // Would invoke actual A2 agent here via Task tool
    // For now, use enhanced heuristic extraction
    requirements = await extractRequirementsEnhanced(briefContent, briefPath);
  }

  // Persist requirements to reports
  const reportPath = path.join(process.cwd(), `reports/requirements/${runId}.json`);
  const reportDir = path.dirname(reportPath);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(requirements, null, 2), 'utf8');

  logHook('RequirementsAnalysisComplete', {
    runId,
    reportPath,
    capabilityCount: requirements.capabilities.length,
    riskCount: requirements.risks.length,
  });

  return requirements;
}

/**
 * Heuristic requirements extraction for dry-run mode
 * @param {string} content - Brief content
 * @param {string} briefPath - Path to brief file
 * @returns {object} Extracted requirements
 */
async function extractRequirementsHeuristic(content, briefPath) {
  const requirements = {
    version: '1.0',
    brief_id: path.basename(briefPath, path.extname(briefPath)),
    analysis_timestamp: Date.now(),
    capabilities: [],
    risks: [],
    dependencies: {},
    estimates: {
      total_complexity: 0,
      total_hours: 0,
      confidence: 0.7,
    },
  };

  // Extract capabilities from common patterns
  const patterns = {
    ecommerce: {
      keywords: ['shop', 'cart', 'product', 'catalog', 'checkout', 'payment', 'order', 'inventory'],
      capabilities: [
        {
          name: 'Product Catalog',
          type: 'web',
          priority: 'must_have',
          description: 'Display and browse products',
          acceptance_criteria: [
            'Products displayed in grid/list view',
            'Product details accessible',
            'Responsive design for mobile/desktop',
          ],
        },
        {
          name: 'Shopping Cart',
          type: 'web',
          priority: 'must_have',
          description: 'Manage items for purchase',
          acceptance_criteria: [
            'Add/remove items from cart',
            'Update quantities',
            'Calculate totals with tax',
          ],
        },
        {
          name: 'Checkout Flow',
          type: 'web',
          priority: 'must_have',
          description: 'Complete purchase process',
          acceptance_criteria: [
            'Guest checkout option',
            'Payment processing',
            'Order confirmation',
          ],
        },
      ],
    },
    saas: {
      keywords: [
        'dashboard',
        'user',
        'auth',
        'login',
        'account',
        'subscription',
        'analytics',
        'report',
      ],
      capabilities: [
        {
          name: 'User Authentication',
          type: 'api',
          priority: 'must_have',
          description: 'Secure user access control',
          acceptance_criteria: [
            'User registration with email verification',
            'Secure login/logout',
            'Password reset functionality',
          ],
        },
        {
          name: 'Dashboard',
          type: 'web',
          priority: 'must_have',
          description: 'Main user interface',
          acceptance_criteria: [
            'Overview metrics displayed',
            'Navigation to features',
            'Responsive layout',
          ],
        },
        {
          name: 'Analytics & Reports',
          type: 'web',
          priority: 'nice_to_have',
          description: 'Data visualization and insights',
          acceptance_criteria: ['Generate reports', 'Export data', 'Interactive charts'],
        },
      ],
    },
    api: {
      keywords: ['api', 'endpoint', 'rest', 'graphql', 'webhook', 'integration', 'service'],
      capabilities: [
        {
          name: 'API Gateway',
          type: 'api',
          priority: 'must_have',
          description: 'Central API management',
          acceptance_criteria: [
            'RESTful endpoints',
            'Authentication/authorization',
            'Rate limiting',
          ],
        },
        {
          name: 'Data Endpoints',
          type: 'api',
          priority: 'must_have',
          description: 'CRUD operations for resources',
          acceptance_criteria: [
            'Create/Read/Update/Delete operations',
            'Input validation',
            'Error handling',
          ],
        },
      ],
    },
    data: {
      keywords: ['database', 'data', 'pipeline', 'etl', 'warehouse', 'analytics', 'migration'],
      capabilities: [
        {
          name: 'Data Ingestion',
          type: 'data',
          priority: 'must_have',
          description: 'Import data from sources',
          acceptance_criteria: [
            'Multiple format support',
            'Validation and cleaning',
            'Error handling',
          ],
        },
        {
          name: 'Data Processing',
          type: 'data',
          priority: 'must_have',
          description: 'Transform and enrich data',
          acceptance_criteria: [
            'Transformation rules',
            'Data quality checks',
            'Performance optimization',
          ],
        },
      ],
    },
  };

  // Detect project type from keywords
  const contentLower = content.toLowerCase();
  let detectedTypes = [];
  let allCapabilities = [];

  for (const [type, config] of Object.entries(patterns)) {
    const keywordCount = config.keywords.filter((kw) => contentLower.includes(kw)).length;
    if (keywordCount >= 2) {
      detectedTypes.push(type);
      allCapabilities.push(...config.capabilities);
    }
  }

  // If no specific type detected, use generic capabilities
  if (allCapabilities.length === 0) {
    allCapabilities = [
      {
        name: 'Core Functionality',
        type: 'web',
        priority: 'must_have',
        description: 'Main application features',
        acceptance_criteria: [
          'Primary user flows work end-to-end',
          'Data persistence',
          'Error handling',
        ],
      },
      {
        name: 'User Interface',
        type: 'web',
        priority: 'must_have',
        description: 'User-facing interface',
        acceptance_criteria: [
          'Responsive design',
          'Intuitive navigation',
          'Accessibility compliance',
        ],
      },
      {
        name: 'Backend Services',
        type: 'api',
        priority: 'must_have',
        description: 'Server-side logic',
        acceptance_criteria: ['API endpoints functional', 'Data validation', 'Security measures'],
      },
    ];
  }

  // Assign IDs and calculate complexity
  allCapabilities.forEach((cap, index) => {
    cap.id = `CAP-${String(index + 1).padStart(3, '0')}`;
    cap.complexity = estimateComplexity(cap);
    cap.estimated_hours = cap.complexity * 3; // Simple heuristic: 3 hours per complexity point
    requirements.capabilities.push(cap);
    requirements.estimates.total_complexity += cap.complexity;
    requirements.estimates.total_hours += cap.estimated_hours;
  });

  // Detect dependencies
  requirements.dependencies = detectCapabilityDependencies(requirements.capabilities);

  // Identify common risks
  requirements.risks = identifyRisks(content, requirements.capabilities);

  return requirements;
}

/**
 * Enhanced requirements extraction (simulates agent analysis)
 * @param {string} content - Brief content
 * @param {string} briefPath - Path to brief file
 * @returns {object} Extracted requirements
 */
async function extractRequirementsEnhanced(content, briefPath) {
  // Start with heuristic extraction
  const requirements = await extractRequirementsHeuristic(content, briefPath);

  // Enhance with more sophisticated analysis
  // Parse structured sections if present
  const sections = parseMarkdownSections(content);

  // Refine capabilities based on must-have features
  if (sections.mustHave && sections.mustHave.length > 0) {
    requirements.capabilities = mapFeaturesToCapabilities(sections.mustHave, sections.niceToHave);
  }

  // Extract technical requirements
  if (sections.technical) {
    requirements.technical_requirements = extractTechnicalRequirements(sections.technical);
  }

  // Extract constraints
  if (sections.constraints) {
    requirements.constraints = sections.constraints;
  }

  // Re-calculate estimates based on refined data
  requirements.estimates.total_complexity = requirements.capabilities.reduce(
    (sum, cap) => sum + cap.complexity,
    0,
  );
  requirements.estimates.total_hours = requirements.capabilities.reduce(
    (sum, cap) => sum + cap.estimated_hours,
    0,
  );
  requirements.estimates.confidence = 0.85; // Higher confidence with enhanced analysis

  return requirements;
}

/**
 * Parse markdown sections
 * @param {string} content - Markdown content
 * @returns {object} Parsed sections
 */
function parseMarkdownSections(content) {
  const sections = {};

  // Extract must-have features
  const mustHaveMatch = content.match(
    /##\s*Must[\s-]?Have(?:\s+Features?)?\s*\n([\s\S]*?)(?=\n##|$)/i,
  );
  if (mustHaveMatch) {
    sections.mustHave = extractListItems(mustHaveMatch[1]);
  }

  // Extract nice-to-have features
  const niceToHaveMatch = content.match(
    /##\s*Nice[\s-]?to[\s-]?Have(?:\s+Features?)?\s*\n([\s\S]*?)(?=\n##|$)/i,
  );
  if (niceToHaveMatch) {
    sections.niceToHave = extractListItems(niceToHaveMatch[1]);
  }

  // Extract technical requirements
  const techMatch = content.match(/##\s*Technical\s+Requirements?\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (techMatch) {
    sections.technical = techMatch[1];
  }

  // Extract constraints
  const constraintsMatch = content.match(
    /##\s*(?:Constraints?|Budget\s*&?\s*Timeline)\s*\n([\s\S]*?)(?=\n##|$)/i,
  );
  if (constraintsMatch) {
    sections.constraints = parseConstraints(constraintsMatch[1]);
  }

  return sections;
}

/**
 * Extract list items from text
 * @param {string} text - Text containing list items
 * @returns {string[]} Extracted items
 */
function extractListItems(text) {
  const items = [];
  const listPattern = /^[\s]*(?:[-*+]|\d+\.)\s+(.+)$/gm;
  let match;

  while ((match = listPattern.exec(text)) !== null) {
    items.push(match[1].trim());
  }

  return items;
}

/**
 * Parse constraints from text
 * @param {string} text - Constraints text
 * @returns {object} Parsed constraints
 */
function parseConstraints(text) {
  const constraints = {};

  // Budget
  const budgetMatch = text.match(/[Bb]udget[:\s]*\$?([\d,]+(?:\.\d+)?)/);
  if (budgetMatch) {
    constraints.budget_usd = parseFloat(budgetMatch[1].replace(/,/g, ''));
  }

  // Timeline
  const timelineMatch = text.match(/[Tt]imeline[:\s]*(\d+)\s*(?:days?|weeks?)/i);
  if (timelineMatch) {
    const value = parseInt(timelineMatch[1]);
    const unit = timelineMatch[0].toLowerCase();
    constraints.timeline_days = unit.includes('week') ? value * 7 : value;
  }

  return constraints;
}

/**
 * Map features to capabilities
 * @param {string[]} mustHave - Must-have features
 * @param {string[]} niceToHave - Nice-to-have features
 * @returns {object[]} Capabilities
 */
function mapFeaturesToCapabilities(mustHave, niceToHave = []) {
  const capabilities = [];
  let capId = 1;

  // Process must-have features
  mustHave.forEach((feature) => {
    const cap = featureToCapability(feature, 'must_have', capId++);
    if (cap) capabilities.push(cap);
  });

  // Process nice-to-have features
  niceToHave.forEach((feature) => {
    const cap = featureToCapability(feature, 'nice_to_have', capId++);
    if (cap) capabilities.push(cap);
  });

  return capabilities;
}

/**
 * Convert a feature description to a capability
 * @param {string} feature - Feature description
 * @param {string} priority - Priority level
 * @param {number} id - Capability ID number
 * @returns {object} Capability object
 */
function featureToCapability(feature, priority, id) {
  const featureLower = feature.toLowerCase();

  // Determine capability type
  let type = 'web'; // default
  if (featureLower.includes('api') || featureLower.includes('endpoint')) {
    type = 'api';
  } else if (featureLower.includes('database') || featureLower.includes('data')) {
    type = 'data';
  } else if (
    featureLower.includes('ai') ||
    featureLower.includes('ml') ||
    featureLower.includes('model')
  ) {
    type = 'ai';
  }

  // Extract name (first noun phrase or key terms)
  let name = feature.split(/[,.]/)[0].trim();
  if (name.length > 50) {
    name = name.substring(0, 50) + '...';
  }

  // Generate acceptance criteria based on feature keywords
  const criteria = generateAcceptanceCriteria(feature);

  const capability = {
    id: `CAP-${String(id).padStart(3, '0')}`,
    name,
    type,
    priority,
    description: feature,
    acceptance_criteria: criteria,
    complexity: estimateComplexity({ name, type, acceptance_criteria: criteria }),
    estimated_hours: 0,
  };

  capability.estimated_hours = capability.complexity * 3;

  return capability;
}

/**
 * Generate acceptance criteria from feature description
 * @param {string} feature - Feature description
 * @returns {string[]} Acceptance criteria
 */
function generateAcceptanceCriteria(feature) {
  const criteria = [];
  const featureLower = feature.toLowerCase();

  // Common patterns
  if (featureLower.includes('search')) {
    criteria.push('Search returns relevant results');
    criteria.push('Search response time under 2 seconds');
  }

  if (featureLower.includes('filter')) {
    criteria.push('Filters update results dynamically');
    criteria.push('Multiple filters can be combined');
  }

  if (featureLower.includes('cart') || featureLower.includes('basket')) {
    criteria.push('Items can be added/removed from cart');
    criteria.push('Cart persists across sessions');
    criteria.push('Cart totals calculated correctly');
  }

  if (featureLower.includes('checkout') || featureLower.includes('payment')) {
    criteria.push('Payment information validated');
    criteria.push('Order confirmation generated');
    criteria.push('Payment processed securely');
  }

  if (featureLower.includes('dashboard')) {
    criteria.push('Key metrics displayed prominently');
    criteria.push('Data refreshes automatically');
    criteria.push('Responsive layout for all devices');
  }

  if (featureLower.includes('auth') || featureLower.includes('login')) {
    criteria.push('Secure authentication implemented');
    criteria.push('Session management works correctly');
    criteria.push('Password reset functionality available');
  }

  // Default criteria if no specific patterns matched
  if (criteria.length === 0) {
    criteria.push('Feature works as described');
    criteria.push('Error cases handled gracefully');
    criteria.push('Performance meets requirements');
  }

  return criteria;
}

/**
 * Extract technical requirements
 * @param {string} text - Technical requirements text
 * @returns {object} Technical requirements
 */
function extractTechnicalRequirements(text) {
  const requirements = {
    performance: [],
    scalability: [],
    security: [],
    compatibility: [],
  };

  const lines = text.split('\n');

  lines.forEach((line) => {
    const lineLower = line.toLowerCase();

    if (
      lineLower.includes('performance') ||
      lineLower.includes('speed') ||
      lineLower.includes('latency')
    ) {
      requirements.performance.push(line.trim());
    }

    if (
      lineLower.includes('scale') ||
      lineLower.includes('concurrent') ||
      lineLower.includes('users')
    ) {
      requirements.scalability.push(line.trim());
    }

    if (
      lineLower.includes('security') ||
      lineLower.includes('encrypt') ||
      lineLower.includes('auth')
    ) {
      requirements.security.push(line.trim());
    }

    if (
      lineLower.includes('browser') ||
      lineLower.includes('mobile') ||
      lineLower.includes('compatible')
    ) {
      requirements.compatibility.push(line.trim());
    }
  });

  return requirements;
}

/**
 * Estimate complexity of a capability
 * @param {object} capability - Capability object
 * @returns {number} Complexity score (1-10)
 */
function estimateComplexity(capability) {
  let complexity = 1; // Base complexity

  // Type-based complexity
  switch (capability.type) {
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

  // Name-based complexity indicators
  const nameLower = capability.name.toLowerCase();
  if (nameLower.includes('auth') || nameLower.includes('security')) complexity += 2;
  if (nameLower.includes('payment') || nameLower.includes('billing')) complexity += 3;
  if (nameLower.includes('real-time') || nameLower.includes('realtime')) complexity += 2;
  if (nameLower.includes('integration')) complexity += 2;
  if (nameLower.includes('migration')) complexity += 2;

  // Acceptance criteria count
  const criteriaCount = capability.acceptance_criteria?.length || 0;
  if (criteriaCount > 5) complexity += 1;
  if (criteriaCount > 10) complexity += 1;

  return Math.min(complexity, 10); // Cap at 10
}

/**
 * Detect dependencies between capabilities
 * @param {object[]} capabilities - List of capabilities
 * @returns {object} Dependency map
 */
function detectCapabilityDependencies(capabilities) {
  const dependencies = {};

  capabilities.forEach((cap, index) => {
    const deps = [];

    // UI depends on API
    if (cap.type === 'web') {
      const apiCaps = capabilities.filter((c, i) => i < index && c.type === 'api');
      if (apiCaps.length > 0) {
        deps.push(apiCaps[0].id);
      }
    }

    // Checkout depends on cart
    if (cap.name.toLowerCase().includes('checkout')) {
      const cartCap = capabilities.find((c) => c.name.toLowerCase().includes('cart'));
      if (cartCap && cartCap.id !== cap.id) {
        deps.push(cartCap.id);
      }
    }

    // Everything depends on auth if present
    const authCap = capabilities.find((c) => c.name.toLowerCase().includes('auth'));
    if (authCap && authCap.id !== cap.id && cap.priority === 'must_have') {
      if (!deps.includes(authCap.id)) {
        deps.push(authCap.id);
      }
    }

    if (deps.length > 0) {
      dependencies[cap.id] = deps;
    }
  });

  return dependencies;
}

/**
 * Identify risks based on content and capabilities
 * @param {string} content - Brief content
 * @param {object[]} capabilities - List of capabilities
 * @returns {object[]} Identified risks
 */
function identifyRisks(content, capabilities) {
  const risks = [];
  const contentLower = content.toLowerCase();

  // Payment integration risk
  if (
    contentLower.includes('payment') ||
    contentLower.includes('stripe') ||
    contentLower.includes('checkout')
  ) {
    risks.push({
      description: 'Payment integration complexity',
      impact: 'high',
      probability: 'medium',
      mitigation: 'Use established payment SDK (Stripe/PayPal) with proven integration patterns',
    });
  }

  // Scalability risk
  if (
    contentLower.includes('1000') ||
    contentLower.includes('concurrent') ||
    contentLower.includes('scale')
  ) {
    risks.push({
      description: 'Scalability requirements may require architecture changes',
      impact: 'medium',
      probability: 'medium',
      mitigation: 'Design for horizontal scaling from the start, use caching and CDN',
    });
  }

  // Timeline risk
  if (
    contentLower.includes('urgent') ||
    contentLower.includes('asap') ||
    contentLower.includes('1 week')
  ) {
    risks.push({
      description: 'Aggressive timeline may compromise quality',
      impact: 'high',
      probability: 'high',
      mitigation: 'Focus on MVP features first, defer nice-to-have items',
    });
  }

  // Integration risk
  if (
    contentLower.includes('integrate') ||
    contentLower.includes('third-party') ||
    contentLower.includes('api')
  ) {
    risks.push({
      description: 'Third-party integration dependencies',
      impact: 'medium',
      probability: 'low',
      mitigation: 'Build abstraction layers, implement fallback mechanisms',
    });
  }

  // Complexity risk based on capability count
  if (capabilities.length > 10) {
    risks.push({
      description: 'High project complexity with many moving parts',
      impact: 'medium',
      probability: 'medium',
      mitigation: 'Break into phases, deliver incrementally with continuous validation',
    });
  }

  return risks;
}

/**
 * Log an event to the hooks observability system
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
    module: 'call_agent',
    ...data,
  };

  fs.appendFileSync(hookPath, JSON.stringify(entry) + '\n', 'utf8');
}

export default {
  invokeRequirementsAnalyst,
};
