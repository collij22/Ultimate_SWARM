You’re starting with a blank context. Prime yourself on the Swarm1 codebase and working method using the docs below. Swarm1 is an agentic swarm system which can solve complex business and technical problems by using a swarm of Claude code agents. Keep your reply short, action-oriented, and scoped to the current repo. Do not over-explain.

## Load these references (skim, don’t paraphrase them back)
@CLAUDE.md
@docs/SWARM1-GUIDE.md
@docs/ARCHITECTURE.md
@docs/ORCHESTRATION.md
@docs/QUALITY-GATES.md
@docs/verify.md
@mcp/registry.yaml
@mcp/policies.yaml
@capabilities/AUV-0001.yaml
@tests/robot/playwright/playwright.config.ts
@tests/robot/playwright/add-to-cart.spec.ts
@tests/robot/playwright/api/cart.spec.ts
@orchestration/cvf-check.mjs
@mock/server.js

## Project TL;DR (internalize)
- Swarm1 delivers AUV-sized vertical slices with contract-first design and evidence-based gates.
- Agents request **capabilities**, not tools. Router maps capabilities via **mcp/policies.yaml** and catalog in **mcp/registry.yaml (v2)**. Prefer **Primary** tools; propose **Secondary** with a small budget + consent.
- Lanes run in parallel except serialized resources (lockfiles, DB migrations, build switches).
- Proofs and artifacts live in **runs/**; reports in **reports/**. CVF/QA/Security must be green before promotion.

## House rules
- IMPORTANT: Never mutate production or secrets. Assume **staging/test** only.
- IMPORTANT: Keep outputs concise and machine-readable when producing artifacts (XML/JSON).
- Aim for **Level-3** deliverables (runnable, reversible, evidenced).
- Use the repo’s structure and policies as the single source of truth (don’t invent files/paths).

## What you should do now
1) Confirm understanding of:
   - AUV model (see @capabilities/AUV-0001.yaml), gates (CVF/QA/Security), and where artifacts go.
   - MCP routing basics: capability_map & agents.allowlist in @mcp/policies.yaml; tool metadata in @mcp/registry.yaml.
2) Verify local run facts (don’t leak tokens):
   - STAGING_URL / API_BASE expected; mock server exists at @mock/server.js; Playwright config under @tests/robot/playwright/playwright.config.ts.
3) Offer a 3–5 line status snapshot and next steps menu tailored to this repo (e.g., “run mock + tests”, “add new AUV”, “extend gates”, “wire real staging”).

## Output format
Reply with exactly this structure:

<ready>
  <snapshot>
    <!-- 3–5 bullets: what this repo is, where the gates & artifacts live, and the current AUV focus -->
  </snapshot>
  <quick_commands>
    npm run mock:staging
    STAGING_URL=http://localhost:3000 API_BASE=http://localhost:3000/api npx playwright test -c tests/robot/playwright/playwright.config.ts
    node orchestration/cvf-check.mjs AUV-0001
  </quick_commands>
  <menus>
    <option id="1">Create a new AUV spec from template</option>
    <option id="2">Extend QA/Security gates (lint/type/semgrep/gitleaks)</option>
    <option id="3">Draft agent tool_allowlist for a task (capabilities → tools)</option>
    <option id="4">Plan parallelization vs serialized steps for a change</option>
  </menus>
  <notes>
    - Prefer Primary MCPs; propose Secondary with budget + consent.
    - Keep changes small and AUV-sized; one change per PR where practical.
  </notes>
</ready>
