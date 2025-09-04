# Router Fixtures — Tool Plan Resolution

These lightweight YAML fixtures describe **input → expected tool_plan** outcomes for the Swarm1 MCP Router.
Use them to sanity-check policy/routing behavior as you evolve `/mcp/policies.yaml` and `/mcp/registry.yaml` (v2).

## Structure
Each file contains:
- `name`: scenario label
- `input`: the agent and requested capabilities (what the agent asks for)
- `expected`: the tool plan the router should emit (allowlist, proposals, budgets, or escalations)

## Suggested Use
- Keep these alongside your router tests, or load them in your Orchestrator's dry-run mode.
- When policies change, update expectations here to prevent regressions.
