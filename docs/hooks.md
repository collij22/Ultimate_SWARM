# Hooks (Claude Code) — Swarm1

Swarm1 uses **Claude Code hooks** to make runs observable, auditable, and budget-safe. Hooks receive a JSON payload on **stdin**, and may **allow** (exit `0`) or **block** (exit `2`) a tool call. We log one JSON line per event to `runs/observability/hooks.jsonl` and emit small **Result Cards** to support gates.

---

## Events we use

- **SessionStart** → `scripts/hooks/session_start.py`  
  Initializes a session ledger and logs environment basics.
- **PreToolUse** → `scripts/hooks/pre_tool.py`  
  Enforces safety (HTTP host, file writes, shell patterns), **secondary-tool consent**, and budgets. Can block.
- **PostToolUse** → `scripts/hooks/post_tool.py`  
  Logs outcome + sizes; sanitizes secrets in a short response snippet.
- **SubagentStop** → `scripts/hooks/subagent_stop.py`  
  Writes a **Result Card** summarizing the sub-agent’s tool usage for this session.
- **SessionEnd** → `scripts/hooks/session_end.py`  
  Rolls up session tool stats; writes a **session Result Card** (if `AUV_ID` set).

> Exit codes: `0` = continue; `2` = block (Claude Code displays stderr to the agent and skips the call).

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
`runs/observability/ledgers/session-<id>.json` and blocks if the **estimated** spend would exceed the budget in `mcp/policies.yaml → tiers.secondary`.

> Source of truth for routing remains **`mcp/policies.yaml`** (capabilities → tools, allowlists, budgets). Hooks only enforce local safety/consent/budget rules at the edge.

---

## Environment variables recognized

- `AUV_ID` — tag evidence to a specific AUV run (recommended).
- `CLAUDE_AGENT_NAME` — logged with every event.
- `SECONDARY_CONSENT` — `"true"` / `"1"` to allow secondary tools.
- `STAGING_URL`, `API_BASE` — define allowed HTTP hosts.
- `CLAUDE_PROJECT_DIR` — set by Claude Code; used for path safety & logs.

---

## Reading the logs (examples)

**Show last 20 events**  
```bash
tail -n 20 runs/observability/hooks.jsonl
