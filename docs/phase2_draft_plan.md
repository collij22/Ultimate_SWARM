# Phase 2 Implementation Plan: Brief Intake & AUV Compiler

## Executive Summary

Transform raw Upwork-style briefs into verified, executable AUVs (Atomic Units of Value) with acceptance criteria, authoring hints, and budget estimates. Output must be deterministic, machine-validated, and immediately runnable with the existing autopilot (Playwright + Lighthouse + CVF), establishing the feedstock for Phase 3’s DAG runner.

Timeline: 12 days
Outcome: Automated brief → AUV pipeline that generates testable, verifiable capabilities
Key Principles: Single-source-of-truth contracts, idempotent generation, artifact-first, capability-first, policy-governed

---

## Scope (Phase 2) and Progression

- In-scope:
  - Parse and validate briefs against a JSON Schema (draft-07)
  - Produce ≥3 AUV specs with complete acceptance criteria and authoring hints compatible with `orchestration/lib/test_authoring.mjs`
  - Create `capabilities/backlog.yaml` with `depends_on[]`, `status`, and `estimates{tokens,mcp_usd,time}`
  - Persist structured requirements to `reports/requirements/<RUN-ID>.json`
  - Wire a CLI entry to run the compiler end-to-end and validate outputs
  - Emit observability events to `runs/observability/hooks.jsonl`

- Out-of-scope (deferred to later phases but enabled by outputs):
  - DAG execution and durable workflow (Phase 3)
  - Runtime MCP router (Phase 4)
  - Autonomous build lane & PR flow (Phase 5)

- Progression:
  - From Phase 1: We already have autopilot, CVF gates, and auto-authoring. Phase 2 feeds this system with generated AUVs.
  - Into Phase 3: `capabilities/backlog.yaml` becomes the DAG input (nodes/edges inferred from `depends_on`). Estimates and statuses guide scheduling and retries.

---

## Deliverables (Files to Add/Update)

- contracts/brief.schema.json
- orchestration/lib/validate_brief.mjs
- orchestration/lib/call_agent.mjs
- orchestration/lib/auv_compiler.mjs
- capabilities/templates/AUV-TEMPLATE.yaml
- briefs/demo-01/brief.md (sample)
- capabilities/backlog.yaml (generated)
- reports/requirements/<RUN-ID>.json (generated)
- docs/brief-guide.md
- docs/ORCHESTRATION.md (add “Brief → Backlog” section)
- orchestration/cli.mjs (extend with plan/validate subcommands)

Optional CI/docs:

- .github/workflows/ci.yml (add compiler unit/integration jobs)
- CHANGELOG.md (Phase 2 completion entry)

Dependencies:

- Add runtime validator: ajv (keep ajv-cli for scripts)
- Reuse existing yaml dependency (avoid adding handlebars; generate YAML programmatically for determinism)

---

## Interfaces & Schemas

### Brief Schema (draft-07)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://swarm1/contracts/brief.schema.json",
  "title": "Swarm1 Brief",
  "type": "object",
  "required": ["business_goals", "must_have"],
  "properties": {
    "business_goals": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "must_have": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "nice_to_have": { "type": "array", "items": { "type": "string" } },
    "constraints": {
      "type": "object",
      "properties": {
        "budget_usd": { "type": "number", "minimum": 0 },
        "timeline_days": { "type": "integer", "minimum": 1 },
        "tech_stack": { "type": "array", "items": { "type": "string" } },
        "environments": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": true
    },
    "sample_urls": { "type": "array", "items": { "type": "string", "format": "uri" } }
  },
  "additionalProperties": true
}
```

### AUV Template (must match auto-authoring expectations)

```yaml
id: AUV-{{ID}}
title: {{TITLE}}
owner: {{DOMAIN}}        # web|api|data|ai
status: pending
tags: {{TAGS}}           # [ui, api, ...]

acceptance:
  summary: {{SUMMARY}}
  criteria:
    {{#each CRITERIA}}
    - {{this}}
    {{/each}}

tests:
  playwright:
    - tests/robot/playwright/{{FEATURE}}.spec.ts
  api:
    - tests/robot/playwright/api/{{FEATURE}}.spec.ts

authoring_hints:
  ui:
    page: {{PAGE_URL}}
    # Product/search-style hints (used by genUiSpec default path)
    search_input: "{{SEARCH_SELECTOR}}"          # e.g. "#q"
    min_price_input: "{{MIN_PRICE_SELECTOR}}"   # e.g. "#minPrice"
    max_price_input: "{{MAX_PRICE_SELECTOR}}"   # e.g. "#maxPrice"
    apply_button_text: "{{APPLY_BUTTON_TEXT}}"  # e.g. "Apply"
    card_selector: "{{CARD_SELECTOR}}"          # e.g. "[data-testid='product-card']"
    title_selector: "{{TITLE_SELECTOR}}"
    price_selector: "{{PRICE_SELECTOR}}"
    screenshot: "{{SCREENSHOT}}.png"
    # Cart-style (if applicable; enables genUiCartSpec)
    row_selector: "{{CART_ROW_SELECTOR}}"
    subtotal_selector: "{{SUBTOTAL_SELECTOR}}"
    tax_selector: "{{TAX_SELECTOR}}"
    total_selector: "{{TOTAL_SELECTOR}}"
    # Checkout-style (if applicable; enables genUiCheckoutSpec)
    name_selector: "{{NAME_SELECTOR}}"
    email_selector: "{{EMAIL_SELECTOR}}"
    address_selector: "{{ADDRESS_SELECTOR}}"
    card_selector_checkout: "{{CARD_SELECTOR_CHECKOUT}}"
    submit_selector: "{{SUBMIT_SELECTOR}}"
    success_selector: "{{SUCCESS_SELECTOR}}"

  api:
    base_path: {{API_BASE}}       # e.g. "/products" (normalized: leading /api stripped by generator)
    cases:
      {{#each API_CASES}}
      - name: {{name}}
        method: {{method}}        # GET|POST|PUT|PATCH|DELETE
        path: {{path}}            # "/?q=term" or "/summary"
        body: {{body}}            # optional
        expect_status: {{status}} # optional; default 200 or 201 on POST
        setup: {{setup}}          # optional; for cart/checkout flows
        summary_path: {{summary}} # optional; enables cart summary validation
      {{/each}}

dependencies:
  {{#each DEPENDENCIES}}
  - {{this}}
  {{/each}}

estimates:
  complexity: {{COMPLEXITY}}      # 1-10
  tokens: {{TOKEN_ESTIMATE}}
  mcp_usd: {{MCP_COST}}
  time_hours: {{TIME_ESTIMATE}}
```

Notes:

- UI hint keys align with `orchestration/lib/test_authoring.mjs`.
- API hints normalize `base_path` by stripping a leading `/api` (generator behavior).
- Template engine optional; deterministic YAML generation with the existing `yaml` lib is preferred.

---

## Module Responsibilities

- orchestration/lib/validate_brief.mjs
  - Validate a brief file or object against `contracts/brief.schema.json` using Ajv
  - Return a typed object; throw with human-friendly errors; log to hooks

- orchestration/lib/call_agent.mjs
  - `invokeRequirementsAnalyst(briefPath, { dryRun })`
  - Wrap A2 Requirements Analyst call; support `dryRun` heuristic extraction (pattern-based) to avoid external dependencies
  - Persist to `reports/requirements/<RUN-ID>.json` and emit hooks

- orchestration/lib/auv_compiler.mjs
  - parseBrief(briefPath) → structured brief
  - extractCapabilities(brief or requirements) → list of capability records (name, type, owner, hints, risks, priority)
  - generateAuvSpec(capability, idAllocator) → YAML spec (authoring_hints compatible with test_authoring)
  - computeDependencies(auvs) → `depends_on[]` via simple rules (UI → API, data creators → data consumers, auth prerequisites)
  - estimateBudget(auv) → { tokens, mcp_usd, time_hours, complexity } (conservative with 20% buffer)
  - writeBacklog(auvs) → `capabilities/backlog.yaml` with totals and statuses
  - Idempotent writes (`writeIfDifferent` pattern) and stable ordering

- orchestration/cli.mjs (extensions)
  - `node orchestration/cli.mjs plan <brief-path> [--dry-run]`
    - Validate brief → invoke A2 (or heuristic) → compile AUVs → write specs + backlog → emit hooks
    - Print next-step hint: `node orchestration/cli.mjs <FIRST-AUV-ID>`
  - `node orchestration/cli.mjs validate auv <AUV-ID>`
    - Sanity check AUV spec (schema + hints presence) and readiness for auto-authoring

---

## Observability & Safety

- Hooks to `runs/observability/hooks.jsonl`:
  - PlanStart, PlanBriefValidated, PlanRequirementsSaved, PlanAuvEmitted, PlanBacklogWritten, PlanEnd
- Artifacts:
  - `reports/requirements/<RUN-ID>.json`
  - Generated `capabilities/AUV-01xx.yaml` files
  - `capabilities/backlog.yaml`
- Safety:
  - No production access; redact secrets/PII
  - Secondary tools not invoked in Phase 2 (analysis only); if any, require consent/budget per policies
- Determinism:
  - Stable sorting and IDs; time-based RUN-ID only in artifact paths, not in content
  - Idempotent writes; avoid nondeterministic timestamps inside YAML

---

## Implementation Steps (12 Days)

Day 1–2: Schema & Validator

- Add `contracts/brief.schema.json` (draft-07); write `validate_brief.mjs` with Ajv
- Sample brief: `briefs/demo-01/brief.md`
- CLI script: `npm run validate:brief -- briefs/demo-01/brief.md` (ajv-cli)
- Unit tests (Node test runner) for required/invalid fields

Day 3–4: Requirements Analysis Integration

- Implement `call_agent.mjs` with `invokeRequirementsAnalyst(...)`
- Define structured output JSON shape (versioned) and persist to `reports/requirements/<RUN-ID>.json`
- Add `--dry-run` heuristic extractor (e-commerce patterns, keywords, constraints)

Day 5–7: Compiler Core

- Implement `auv_compiler.mjs` functions (parse/extract/generate/deps/estimate/writeBacklog)
- Ensure `authoring_hints` map to test_authoring’s keys; normalize API paths
- Id allocation: `AUV-0101..` sequential for the project; ensure uniqueness
- Emit hooks for traceability

Day 8–9: Templates & Backlog Aggregation

- Create `capabilities/templates/AUV-TEMPLATE.yaml`
- Generate initial AUV YAML files and a consolidated `backlog.yaml` with totals and statuses
- Update `docs/ORCHESTRATION.md` with “Brief → Backlog” quickstart

Day 10–11: CLI & E2E Validation

- Extend `orchestration/cli.mjs` with `plan` and `validate auv`
- E2E: run plan on `briefs/demo-01/brief.md`; then `node orchestration/cli.mjs <FIRST-AUV-ID>`
- Confirm auto-authored tests exist; run autopilot; ensure CVF PASS for first AUV

Day 12: Polish & Docs

- Add `docs/brief-guide.md`, troubleshooting, estimation methodology
- Add compiler unit/integration jobs in CI; ensure artifacts uploaded
- Update `CHANGELOG.md`

---

## Acceptance & Proofs

- Given `briefs/demo-01/brief.md`, compiler emits ≥3 AUV-01xx with:
  - `acceptance.criteria[]`, `authoring_hints.ui/api`, `dependencies[]`, `estimates{tokens,mcp_usd,time_hours,complexity}`
  - `capabilities/backlog.yaml` with totals and per-AUV statuses
- `reports/requirements/<RUN-ID>.json` exists and is referenced by emitted AUVs
- First generated AUV:
  - Auto-authored tests present
  - `node orchestration/cli.mjs <AUV-ID>` produces required artifacts and CVF PASS
- Hooks show PlanStart → PlanEnd with intermediate events
- `npm run validate:cards` passes for the autopilot run

---

## Testing Strategy

- Unit (Node test runner)
  - validate_brief: required fields, constraints min/max, sample_urls format
  - extractCapabilities: patterned inputs (e-commerce, SaaS) → expected capability names/tags
  - dependency detection: UI → API, data providers/consumers, auth prerequisites
  - estimateBudget: bounded outputs, 20% buffer logic

- Integration
  - brief file → requirements JSON → AUV YAML(s) → backlog.yaml
  - generated AUV → test_authoring compatibility (files created with correct hints)

- E2E
  - `node orchestration/cli.mjs plan briefs/demo-01/brief.md`
  - `node orchestration/cli.mjs <FIRST-AUV-ID>` → expect green CVF, artifacts present

---

## CI Hooks (Optional in Phase 2, recommended)

- Add job: `compiler:unit` (Node tests)
- Add job: `compiler:integration` (brief→backlog on sample brief; commit artifacts to a temp path)
- Always upload `reports/**` and `runs/**` artifacts for inspection
- Keep Node engine constraint (>=20 <21)

---

## Risks & Mitigations

- Ambiguous requirements → Use A2 validation, confidence scores, and `--dry-run` fallback; allow human-in-loop for < threshold
- Dependency cycles → Topological sort + cycle detection; fall back to sequential ordering
- Budget estimation drift → Conservative estimates + 20% buffer; record real costs later for calibration
- Hint mismatch → Strict mapping to test_authoring keys; unit tests assert presence and types
- Non-determinism → Stable sort, idempotent writes, avoid random seeds in content

---

## Phase 3 Readiness (DAG Integration)

- `capabilities/backlog.yaml` provides:
  - `backlog[].id`, `title`, `depends_on[]`, `status`, `estimates`, `owner`
- Phase 3 runner will:
  - Convert backlog to a graph: nodes by AUV; edges from `depends_on`
  - Use `estimates` for scheduling and retry budgets
  - Reuse artifacts path conventions and hooks
- Addendum for Phase 3 contract:
  - Ensure AUV specs include `artifacts_required.cvf[]` if needed; or derive from CVF SSoT (`expected_artifacts.mjs`)

---

## Quickstart Commands

```bash
# Validate a brief
npx ajv validate -s contracts/brief.schema.json -d briefs/demo-01/brief.md --spec=draft7 --verbose

# Plan from a brief (dry-run heuristic)
node orchestration/cli.mjs plan briefs/demo-01/brief.md --dry-run

# Run the first generated AUV end-to-end
node orchestration/cli.mjs AUV-0101

# Enforce CVF gate explicitly (optional)
node orchestration/cvf-check.mjs AUV-0101

# Tail observability
tail -n 50 runs/observability/hooks.jsonl
```

---

## Definition of Done (Phase 2)

- Brief → AUV compiler produces deterministic AUV YAMLs with correct `authoring_hints` (UI/API) for auto-authoring
- Backlog generated with clear `depends_on` edges; no cycles
- First AUV runs green through autopilot and CVF locally; artifacts present and validated
- Requirements JSON, hooks, and artifacts are present under `reports/**` and `runs/**`
- Documentation and CLI UX updated; CI jobs added for compiler tests

# Phase 2 Implementation Plan: Brief Intake & AUV Compiler

## Executive Summary

Transform raw Upwork-style briefs into verified, executable AUVs (Atomic Units of Value) with acceptance criteria, authoring hints, and budget estimates. This creates the foundation for autonomous requirement decomposition and enables the Swarm1 system to understand and execute arbitrary technical projects.

**Timeline**: 12 days  
**Outcome**: Automated brief � AUV pipeline that generates testable, verifiable capabilities  
**Key Innovation**: NLP-driven requirement extraction with deterministic test generation hints

---

## <� Core Objectives

1. **Parse unstructured briefs** into machine-readable requirement specifications
2. **Generate AUV definitions** with complete acceptance criteria and test hints
3. **Establish dependency graphs** for parallel execution in Phase 3
4. **Estimate resource requirements** (tokens, MCP costs, time) per capability
5. **Maintain traceability** from business requirements to technical implementation

---

## =� Core Deliverables

### 1. Brief Schema & Validation System

**File**: `contracts/brief.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["business_goals", "must_have"],
  "properties": {
    "business_goals": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1
    },
    "must_have": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1
    },
    "nice_to_have": {
      "type": "array",
      "items": { "type": "string" }
    },
    "constraints": {
      "type": "object",
      "properties": {
        "budget_usd": { "type": "number", "minimum": 0 },
        "timeline_days": { "type": "integer", "minimum": 1 },
        "tech_stack": { "type": "array", "items": { "type": "string" } },
        "environments": { "type": "array", "items": { "type": "string" } }
      }
    },
    "sample_urls": {
      "type": "array",
      "items": { "type": "string", "format": "uri" }
    }
  }
}
```

### 2. AUV Compiler Module

**File**: `orchestration/lib/auv_compiler.mjs`

#### Core Functions

| Function                      | Purpose                      | Input        | Output                  |
| ----------------------------- | ---------------------------- | ------------ | ----------------------- |
| `parseBrief(briefPath)`       | Load and validate brief      | File path    | Structured brief object |
| `extractCapabilities(brief)`  | NLP-based feature extraction | Brief object | Capability list         |
| `generateAuvSpec(capability)` | Create AUV YAML              | Capability   | AUV specification       |
| `computeDependencies(auvs)`   | Build dependency DAG         | AUV list     | Dependency graph        |
| `estimateBudget(auv)`         | Calculate resource needs     | AUV spec     | Cost estimates          |
| `writeBacklog(auvs)`          | Generate backlog file        | AUV list     | backlog.yaml            |

#### Key Algorithms

**Capability Extraction**:

- Pattern matching for feature keywords
- Domain-specific templates (e-commerce, SaaS, API)
- Requirement clustering by functional area
- Priority scoring based on "must have" vs "nice to have"

**Dependency Detection**:

```javascript
// Simplified dependency detection logic
function detectDependencies(auv, allAuvs) {
  const dependencies = [];

  // Data dependencies
  if (auv.requires_data && !auv.creates_data) {
    dependencies.push(findDataProvider(auv, allAuvs));
  }

  // UI dependencies on API
  if (auv.type === 'ui' && auv.consumes_api) {
    dependencies.push(findApiProvider(auv, allAuvs));
  }

  // Authentication dependencies
  if (auv.requires_auth) {
    dependencies.push(findAuthProvider(allAuvs));
  }

  return dependencies.filter(Boolean);
}
```

### 3. Agent Integration Module

**File**: `orchestration/lib/call_agent.mjs`

```javascript
export async function invokeRequirementsAnalyst(briefPath) {
  const brief = await fs.readFile(briefPath, 'utf8');

  const prompt = `
    Analyze this project brief and extract:
    1. Core capabilities (user-facing features)
    2. Technical requirements
    3. Acceptance criteria per capability
    4. Risk factors
    5. Suggested implementation order
    
    Brief: ${brief}
    
    Output as structured JSON.
  `;

  // Invoke A2 Requirements Analyst
  const response = await callAgent('requirements-analyst', prompt);

  // Parse and validate response
  const requirements = parseAgentResponse(response);

  // Store for traceability
  const reportPath = `reports/requirements/${Date.now()}.json`;
  await writeReport(reportPath, requirements);

  return requirements;
}
```

### 4. AUV Template System

**File**: `capabilities/templates/AUV-TEMPLATE.yaml`

```yaml
# Template for auto-generated AUVs
id: AUV-{{ID}}
title: {{TITLE}}
owner: {{DOMAIN}}  # web|api|data|ai
status: pending
tags: {{TAGS}}

acceptance:
  summary: {{SUMMARY}}
  criteria:
    {{#each CRITERIA}}
    - {{this}}
    {{/each}}

tests:
  playwright:
    - tests/robot/playwright/{{FEATURE}}.spec.ts
  api:
    - tests/robot/playwright/api/{{FEATURE}}.spec.ts

artifacts:
  required:
    - runs/{{ID}}/ui/{{SCREENSHOT}}.png
    - runs/{{ID}}/perf/lighthouse.json
    {{#if HAS_API}}
    - runs/{{ID}}/api/trace.json
    {{/if}}

authoring_hints:
  ui:
    page: {{PAGE_URL}}
    {{#if SELECTORS}}
    search_input: '{{SEARCH_SELECTOR}}'
    button_selector: '{{BUTTON_SELECTOR}}'
    result_selector: '{{RESULT_SELECTOR}}'
    {{/if}}
    screenshot: '{{SCREENSHOT}}.png'
  {{#if HAS_API}}
  api:
    base_path: {{API_BASE}}
    cases:
      {{#each API_CASES}}
      - name: {{name}}
        method: {{method}}
        path: {{path}}
        expect: {{expect}}
      {{/each}}
  {{/if}}

dependencies:
  {{#each DEPENDENCIES}}
  - {{this}}
  {{/each}}

estimates:
  complexity: {{COMPLEXITY}}  # 1-10
  tokens: {{TOKEN_ESTIMATE}}
  mcp_usd: {{MCP_COST}}
  time_hours: {{TIME_ESTIMATE}}
```

### 5. CLI Extensions

**Updates to**: `orchestration/cli.mjs`

```javascript
// New command: plan
if (command === 'plan') {
  const briefPath = args[0];
  if (!briefPath) {
    console.error('Usage: node orchestration/cli.mjs plan <brief-path>');
    process.exit(2);
  }

  console.log(`[cli] Planning from brief: ${briefPath}`);

  // Step 1: Validate brief
  const brief = await validateBrief(briefPath);

  // Step 2: Extract requirements via A2 agent
  const requirements = await invokeRequirementsAnalyst(briefPath);

  // Step 3: Generate AUVs
  const auvs = await compileAuvs(requirements);

  // Step 4: Create backlog
  const backlogPath = await writeBacklog(auvs);

  console.log(`[cli] Generated ${auvs.length} AUVs`);
  console.log(`[cli] Backlog written to: ${backlogPath}`);
  console.log(`[cli] Next step: node orchestration/cli.mjs ${auvs[0].id}`);
}

// New command: validate
if (command === 'validate') {
  const auvId = args[0];
  const validation = await validateAuv(auvId);

  if (validation.valid) {
    console.log(` ${auvId} is valid and ready for execution`);
  } else {
    console.error(`L ${auvId} validation failed:`);
    validation.errors.forEach((err) => console.error(`  - ${err}`));
  }
}
```

---

## =� Implementation Steps

### Step 1: Schema & Validation (Day 1-2)

#### Tasks

- [ ] Create `contracts/brief.schema.json` with comprehensive validation
- [ ] Implement `orchestration/lib/validate_brief.mjs`
- [ ] Create sample brief in `briefs/demo-01/brief.md`
- [ ] Add unit tests for schema validation
- [ ] Document brief format in `docs/brief-guide.md`

#### Sample Brief Structure

```markdown
# E-Commerce Platform Development

## Business Goals

- Launch an online marketplace for handmade goods
- Support 1000+ artisan vendors
- Process 10,000 orders/month within 6 months

## Must Have Features

- Product catalog with search and filters
- Shopping cart and guest checkout
- Vendor dashboard for inventory management
- Order tracking for customers
- Payment processing (Stripe)

## Nice to Have

- Recommendation engine
- Social sharing features
- Mobile app

## Constraints

- Budget: $8,000
- Timeline: 3 weeks
- Tech Stack: Node.js, React, PostgreSQL
- Deployment: AWS or Vercel
```

### Step 2: Requirements Analysis Integration (Day 3-4)

#### Tasks

- [ ] Implement `call_agent.mjs` with A2 agent invocation
- [ ] Define structured output format for requirements
- [ ] Create requirement � AUV mapping algorithm
- [ ] Build traceability matrix generator
- [ ] Add clarification request handling

#### Output Format

```json
{
  "version": "1.0",
  "brief_id": "demo-01",
  "analysis_timestamp": 1234567890,
  "capabilities": [
    {
      "id": "CAP-001",
      "name": "Product Catalog",
      "priority": "must_have",
      "description": "Display products with pagination",
      "acceptance_criteria": [
        "Products displayed in grid layout",
        "20 products per page",
        "Navigation between pages"
      ],
      "technical_requirements": [
        "API endpoint: GET /products",
        "Database table: products",
        "Frontend component: ProductGrid"
      ]
    }
  ],
  "risks": [
    {
      "description": "Payment integration complexity",
      "mitigation": "Use Stripe's tested SDK"
    }
  ],
  "dependencies": {
    "CAP-002": ["CAP-001"],
    "CAP-003": ["CAP-001", "CAP-002"]
  }
}
```

### Step 3: AUV Compiler Core (Day 5-7)

#### Tasks

- [ ] Build NLP-based requirement parser
- [ ] Implement capability extraction algorithm
- [ ] Create dependency detection system
- [ ] Build complexity scoring model
- [ ] Implement budget estimation formulas
- [ ] Generate comprehensive authoring hints

#### Complexity Scoring Model

```javascript
function calculateComplexity(capability) {
  let score = 1; // Base complexity

  // UI complexity
  if (capability.has_ui) score += 2;
  if (capability.interactive_ui) score += 1;

  // API complexity
  if (capability.has_api) score += 2;
  if (capability.external_integration) score += 2;

  // Data complexity
  if (capability.database_writes) score += 1;
  if (capability.transactions) score += 2;

  // Business logic
  if (capability.complex_validation) score += 1;
  if (capability.async_processing) score += 1;

  return Math.min(score, 10); // Cap at 10
}
```

### Step 4: Template & Generation (Day 8-9)

#### Tasks

- [ ] Create comprehensive AUV template
- [ ] Build YAML generation with Handlebars
- [ ] Implement backlog aggregation
- [ ] Design AUV numbering system
- [ ] Add generated AUV validation

#### Numbering Convention

```
AUV-0001 to AUV-0099: Core framework capabilities
AUV-0100 to AUV-0199: Demo/test capabilities
AUV-0200+: Production capabilities

Within a project:
AUV-01xx: First demo project
AUV-02xx: Second demo project
etc.
```

### Step 5: Integration & Testing (Day 10-11)

#### Tasks

- [ ] Extend CLI with plan/validate commands
- [ ] Wire up full pipeline
- [ ] Test with multiple brief types
- [ ] Validate auto-authoring compatibility
- [ ] Ensure CVF alignment
- [ ] Add performance benchmarks

#### Test Scenarios

1. **E-commerce Brief** � 5-7 AUVs (catalog, cart, checkout, etc.)
2. **SaaS Dashboard** � 4-6 AUVs (auth, dashboard, reports, settings)
3. **API Integration** � 3-4 AUVs (auth, endpoints, webhooks)
4. **Data Pipeline** � 3-5 AUVs (ingestion, transform, storage, query)

### Step 6: Documentation & Refinement (Day 12)

#### Tasks

- [ ] Update `docs/ORCHESTRATION.md`
- [ ] Create `docs/brief-guide.md`
- [ ] Add troubleshooting guide
- [ ] Document estimation methodology
- [ ] Create video walkthrough
- [ ] Update CHANGELOG.md

---

##  Success Criteria

### Functional Requirements

-  Parses 500+ word Upwork brief in <5 seconds
-  Generates e3 valid AUVs with complete specs
-  Each AUV includes authoring hints for auto-test generation
-  Dependencies correctly identified (no cycles)
-  Budget estimates within 30% of actual execution
-  Full traceability from requirements to AUVs

### Quality Gates

-  Generated AUVs pass schema validation
-  Auto-authored tests execute successfully
-  First AUV passes CVF gate
-  No circular dependencies in backlog
-  All artifacts versioned and stored correctly
-  Observability events properly logged

### Performance Targets

| Operation                | Target | Maximum |
| ------------------------ | ------ | ------- |
| Brief parsing            | 2s     | 5s      |
| Requirement extraction   | 5s     | 10s     |
| AUV generation (per cap) | 3s     | 10s     |
| Full pipeline            | 60s    | 120s    |
| Memory usage             | 200MB  | 500MB   |

---

## =� Risk Mitigation

### Risk 1: Ambiguous Requirements

**Impact**: High - Incorrect AUVs lead to failed implementation  
**Probability**: Medium - Common in real-world briefs  
**Mitigation**:

- A2 agent validation with clarification prompts
- Confidence scoring on extracted requirements
- Manual review checkpoint for low-confidence items
  **Fallback**: Human-in-the-loop approval before generation

### Risk 2: Dependency Complexity

**Impact**: High - Circular dependencies block execution  
**Probability**: Low - Detectable via algorithms  
**Mitigation**:

- Topological sort validation
- Cycle detection algorithm
- Dependency visualization tool
  **Fallback**: Flatten to sequential execution

### Risk 3: Budget Overruns

**Impact**: Medium - Incomplete delivery or cost overages  
**Probability**: Medium - Estimation is inherently uncertain  
**Mitigation**:

- Conservative estimation with 20% buffer
- Historical data correlation
- Phased delivery with checkpoints
  **Fallback**: Scope reduction via priority ranking

### Risk 4: Test Generation Failures

**Impact**: Medium - Manual intervention needed  
**Probability**: Low - Authoring hints are comprehensive  
**Mitigation**:

- Extensive hint templates
- Fallback to generic test patterns
- Validation before generation
  **Fallback**: Manual test creation for edge cases

---

## = Integration Points

### With Existing Systems

| System                                | Integration Method                | Data Flow                    |
| ------------------------------------- | --------------------------------- | ---------------------------- |
| Runbook (`auv_delivery.mjs`)          | Generated AUVs � Autopilot        | AUV YAML � Test execution    |
| Test Authoring (`test_authoring.mjs`) | Authoring hints � Auto-generation | Hints � Playwright specs     |
| CVF (`cvf-check.mjs`)                 | Artifact requirements             | Expected � Actual validation |
| MCP Router                            | Budget estimates                  | Cost � Tool selection        |
| Hooks                                 | Brief intake events               | Events � JSONL logs          |

### Enabling Future Phases

**Phase 3 (DAG Runner)**:

- Backlog.yaml becomes DAG input
- Dependencies enable parallelization
- Estimates inform resource allocation

**Phase 4 (MCP Router)**:

- Budget estimates drive Primary vs Secondary tool choices
- Capability requirements map to tool selection

**Phase 5 (Build Lane)**:

- AUVs trigger automated implementation
- Acceptance criteria guide code generation

**Phase 7 (Packaging)**:

- Requirements traced through to deliverables
- Compliance matrix generated automatically

---

## >� Testing Strategy

### Unit Tests

```javascript
describe('Brief Validation', () => {
  test('validates required fields', () => {
    const brief = { business_goals: ['Goal 1'] };
    expect(() => validateBrief(brief)).toThrow('must_have is required');
  });

  test('accepts valid brief', () => {
    const brief = {
      business_goals: ['Goal 1'],
      must_have: ['Feature 1'],
    };
    expect(validateBrief(brief)).toBe(true);
  });
});

describe('Capability Extraction', () => {
  test('extracts e-commerce capabilities', () => {
    const brief = 'Build shopping cart with checkout';
    const capabilities = extractCapabilities(brief);
    expect(capabilities).toContainEqual(expect.objectContaining({ name: 'Shopping Cart' }));
  });
});

describe('Dependency Detection', () => {
  test('detects UI � API dependency', () => {
    const ui = { type: 'ui', consumes_api: '/products' };
    const api = { type: 'api', provides: '/products' };
    const deps = detectDependencies(ui, [api]);
    expect(deps).toContain(api.id);
  });
});
```

### Integration Tests

- Brief file � Requirements extraction
- Requirements � AUV generation
- AUV � Test authoring compatibility
- Backlog � DAG readiness

### E2E Validation

```bash
# Real brief to working system
cp samples/upwork-brief.md briefs/test-01/brief.md
node orchestration/cli.mjs plan briefs/test-01/brief.md
node orchestration/cli.mjs AUV-0101  # First generated AUV
# Expect: Green CVF, artifacts created
```

---

## =� Deliverable Checklist

### Files to Create

- [ ] `contracts/brief.schema.json` - Brief validation schema
- [ ] `orchestration/lib/auv_compiler.mjs` - Core compiler logic
- [ ] `orchestration/lib/call_agent.mjs` - A2 agent integration
- [ ] `orchestration/lib/validate_brief.mjs` - Brief validator
- [ ] `capabilities/templates/AUV-TEMPLATE.yaml` - Generation template
- [ ] `briefs/demo-01/brief.md` - Sample Upwork brief
- [ ] `briefs/demo-01/expected-auvs.yaml` - Expected output
- [ ] `tests/unit/brief-validation.test.js` - Schema tests
- [ ] `tests/unit/auv-compiler.test.js` - Compiler tests
- [ ] `tests/integration/brief-to-auv.test.js` - E2E tests
- [ ] `docs/brief-guide.md` - User documentation

### Files to Update

- [ ] `orchestration/cli.mjs` - Add plan/validate commands
- [ ] `package.json` - Add dependencies (ajv, handlebars)
- [ ] `docs/ORCHESTRATION.md` - Document compiler flow
- [ ] `.github/workflows/ci.yml` - Add compiler tests
- [ ] `mcp/policies.yaml` - Add requirement capabilities
- [ ] `CHANGELOG.md` - Document Phase 2 completion

---

## =� Example Input/Output

### Input Brief (Excerpt)

```markdown
# Project: Artisan Marketplace

## Overview

Create an online marketplace connecting artisan craftspeople with customers
seeking unique, handmade items. Think Etsy but focused on local artisans.

## Must Have Features

1. Product catalog with search and filtering
   - Search by keyword, category, price range
   - Sort by relevance, price, newest
2. Shopping cart and checkout
   - Guest checkout option
   - Saved carts for logged-in users
3. Vendor management
   - Vendor signup and profile creation
   - Product listing management
   - Order fulfillment tracking

## Technical Requirements

- Handle 1000+ products
- Support 100+ concurrent users
- Mobile-responsive design
- Secure payment processing (PCI compliant)

## Budget & Timeline

- Budget: $8,000
- Timeline: 3 weeks
- Preferred stack: Node.js, React, PostgreSQL
```

### Generated AUVs

```yaml
# AUV-0101: Product Catalog with Search
id: AUV-0101
title: Product catalog with search and filters
owner: web
status: pending
tags: [ui, api, search, products]

acceptance:
  summary: Users can browse products and filter by keyword, category, and price
  criteria:
    - Products displayed in responsive grid (mobile/desktop)
    - Search returns relevant results within 2 seconds
    - Filters update results without page reload
    - Pagination shows 20 products per page

tests:
  playwright:
    - tests/robot/playwright/product-catalog.spec.ts
  api:
    - tests/robot/playwright/api/products.spec.ts

authoring_hints:
  ui:
    page: /products
    search_input: '#search-box'
    category_select: '#category-filter'
    price_min: '#price-min'
    price_max: '#price-max'
    product_card: '[data-testid="product-card"]'
    pagination: '[data-testid="pagination"]'
    screenshot: 'product_catalog.png'
  api:
    base_path: /api/products
    cases:
      - name: List products
        method: GET
        path: /
        expect: { status: 200, array: true }
      - name: Search products
        method: GET
        path: /?q=handmade
        expect: { status: 200, contains: 'handmade' }
      - name: Filter by price
        method: GET
        path: /?min_price=10&max_price=100
        expect: { status: 200, price_range: [10, 100] }

dependencies: []

estimates:
  complexity: 5
  tokens: 75000
  mcp_usd: 0.15
  time_hours: 3
```

### Generated Backlog

```yaml
version: '1.0'
generated: 2024-12-XX
brief_id: demo-01
total_estimates:
  tokens: 425000
  mcp_usd: 0.85
  time_hours: 17

backlog:
  - id: AUV-0101
    title: Product catalog with search
    priority: 1
    depends_on: []
    status: pending

  - id: AUV-0102
    title: Shopping cart management
    priority: 1
    depends_on: [AUV-0101]
    status: pending

  - id: AUV-0103
    title: Guest checkout flow
    priority: 1
    depends_on: [AUV-0102]
    status: pending

  - id: AUV-0104
    title: Vendor signup and profiles
    priority: 2
    depends_on: []
    status: pending

  - id: AUV-0105
    title: Product listing management
    priority: 2
    depends_on: [AUV-0104, AUV-0101]
    status: pending

  - id: AUV-0106
    title: Order fulfillment tracking
    priority: 2
    depends_on: [AUV-0103, AUV-0104]
    status: pending
```

---

## =� Next Steps After Phase 2

### Immediate Actions

1. Run compiler on first real brief
2. Execute generated AUVs through autopilot
3. Validate CVF gates pass
4. Measure estimation accuracy
5. Refine templates based on results

### Phase 3 Preparation

- Design DAG execution model
- Plan parallelization strategy
- Define resource locking mechanism
- Create state persistence format

### Continuous Improvement

- Collect metrics on estimation accuracy
- Build corpus of brief � AUV mappings
- Refine NLP patterns
- Optimize generation speed

---

## =� Summary

Phase 2 transforms unstructured business requirements into executable, verifiable technical specifications. By combining NLP-based requirement extraction with deterministic test generation, we create the foundation for fully autonomous project delivery.

The AUV Compiler bridges the gap between human-readable briefs and machine-executable capabilities, enabling the Swarm1 system to tackle arbitrary technical projects with minimal human intervention.

**Key Innovation**: Every generated AUV includes complete authoring hints that enable automatic test generation, ensuring that acceptance criteria are immediately verifiable through the existing autopilot infrastructure.

**Impact**: Reduces requirement-to-implementation time from days to minutes while maintaining full traceability and quality gates.
