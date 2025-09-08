# Hooks (Claude Code) — Swarm1

Swarm1 uses **Claude Code hooks** to make runs observable, auditable, and budget-safe **during orchestration workflows only**. Hooks receive a JSON payload on **stdin**, and may **allow** (exit `0`) or **block** (exit `2`) a tool call. We log one JSON line per event to `runs/observability/hooks.jsonl` and emit small **Result Cards** to support gates.

> Important: Hooks are strictly gated to AUV runs only and are disabled by default for normal coding sessions.

## ⚡ Performance Mode: Swarm-Only Activation

**All hooks now use strict AUV-only gates** — they only perform operations during orchestration workflows, not regular Claude Code interactions:

- **Swarm Mode Active**: When `AUV_ID` is set (strict; `SWARM_ACTIVE` no longer enables processing)
- **Regular Claude Code**: Hooks exit immediately (0) without logging/processing

This prevents performance overhead during simple file reads, questions, or general development.

---

## Installed Hooks

- `scripts/hooks/pre_tool.py` — enforces `agents.allowlist` from `mcp/policies.yaml` **[Swarm Mode Only]**
- `scripts/hooks/post_tool.py` — logs tool outcomes to `runs/observability/hooks.jsonl` **[Swarm Mode Only]**
- `scripts/hooks/session_start.py` — begins per-session ledgers **[Swarm Mode Only]**
- `scripts/hooks/subagent_stop.py` — writes per-agent result cards to `runs/<AUV>/result-cards/*` **[Swarm Mode Only]**
- `scripts/hooks/session_end.py` — session summary card **[Swarm Mode Only]**

**Logs:** `runs/observability/hooks.jsonl`  
**Result Cards:** `runs/<AUV-ID>/result-cards/*.json`

### Modes and gating

- `AUV_ID` must be set for any hook processing.
- `HOOKS_MODE` controls behavior:
  - `off` (default): no-ops; immediate exit 0
  - `warn`: logs but never blocks
  - `block`: enforces policies (PreTool may exit 2 on violations)
- Emergency disable: set `CLAUDE_DISABLE_HOOKS=true` or create `.claude/hooks.disabled`

> **Exit codes:** `0` = continue; `2` = block (Claude Code displays stderr to the agent and skips the call)

---

### Where the data goes

- Stream: `runs/observability/hooks.jsonl`
- Result Cards: `runs/<AUV-ID>/result-cards/*.json` (e.g., `session-<ID>.json`, `subagent-<name>-<session>.json`)

---

## Where artifacts go

- **Event log (JSONL):**  
  `runs/observability/hooks.jsonl`  
  One line per event, with fields like `event`, `session_id`, `agent`, `tool`, `ok`, `reason`, etc.

- **Result Cards (per AUV):**  
  `runs/<AUV-ID>/result-cards/*.json`
  - `subagent-<agent>-<session>.json` (SubagentStop)
  - `session-<session>.json` (SessionEnd)

Both are **evidence sources** for the CVF/QA gates and for troubleshooting.

---

## Policy & safety (what PreTool enforces)

- **Secondary tool consent** (from `mcp/registry.yaml`):  
  Secondary tools are blocked unless `SECONDARY_CONSENT=true` or `.claude/secondary_consent.txt` exists.
- **HTTP host allowlist**:  
  Only **localhost** and hosts implied by `STAGING_URL` / `API_BASE` are allowed by default.
- **Write/Edit sanity**:  
  Must stay inside the project tree; blocks writes to protected files/dirs (e.g., `.env`, `.git`, `node_modules`, `runs/`).
- **Shell guard**:  
  Blocks dangerous patterns (`rm -rf /`, `curl | sh`, `git push`, `docker login`, `kubectl ... prod`, etc.).
- **DB guard (light)**:  
  Warns/blocks if DSN appears production-ish (`prod`).

**Budgets:** For secondary tools, the hook keeps a tiny per-session ledger at  
`runs/observability/ledgers/session-<id>.json` and blocks if the **estimated** spend would exceed the budget in `mcp/policies.yaml → tiers.secondary` (in `block` mode); in `warn` mode it only logs.

> Source of truth for routing remains **`mcp/policies.yaml`** (capabilities → tools, allowlists, budgets). Hooks only enforce local safety/consent/budget rules at the edge.

---

## Environment variables recognized

- `AUV_ID` — tag evidence to a specific AUV run; required for processing
- `HOOKS_MODE` — `off|warn|block` (default `off`)
- `CLAUDE_AGENT_NAME` — logged with every event.
- `SECONDARY_CONSENT` — `"true"` / `"1"` to allow secondary tools.
- `STAGING_URL`, `API_BASE` — define allowed HTTP hosts.
- `CLAUDE_PROJECT_DIR` — set by Claude Code; used for path safety & logs.
- `HOOKS_MAX_LOG_MB` — cap for parsing large logs (default 10 MB)
- `HOOKS_ERROR_TRIP` — consecutive errors to trip circuit breaker (default 3)

---

## Reading the logs (examples)

**Show last 20 events:**

```bash
tail -n 20 runs/observability/hooks.jsonl
```

**Filter by agent:**

```bash
jq 'select(.agent == "rapid-builder")' runs/observability/hooks.jsonl
```

**Show tool usage summary:**

```bash
jq -r '[.tool] | @csv' runs/observability/hooks.jsonl | sort | uniq -c
```

**Check result cards for an AUV:**

```bash
ls runs/AUV-0003/result-cards/
cat runs/AUV-0003/result-cards/session-*.json | jq .
```
