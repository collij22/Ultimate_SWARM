#!/usr/bin/env python3
"""
Swarm1 — Claude Code PreTool hook
- Reads hook input as JSON from stdin (Claude Code standard)
- Enforces basic safety, environment, and policy checks
- Optionally blocks dangerous or out-of-policy tool invocations (exit code 2)
- Logs a single JSON line per event to runs/observability/hooks.jsonl

Drop this file at: scripts/hooks/pre_tool.py
Add to .claude/settings.local.json under hooks.PreToolUse (command: python "$CLAUDE_PROJECT_DIR/scripts/hooks/pre_tool.py")
"""

from __future__ import annotations
import sys, os, json, time, re, pathlib
from urllib.parse import urlparse

# Optional dependency: PyYAML (policy/registry parsing).
# The hook will still run if PyYAML is unavailable.
try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover
    yaml = None  # fallback: skip policy/registry reads

# -------------------- helpers --------------------

def _find_project_root(start):
    cur = os.path.abspath(start)
    for _ in range(8):
        if os.path.isdir(os.path.join(cur, ".claude")) or os.path.isdir(os.path.join(cur, "mcp")):
            return cur
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    return os.getenv("CLAUDE_PROJECT_DIR") or os.getcwd()

PROJECT_DIR = _find_project_root(os.getcwd())

OBS_DIR = os.path.join(PROJECT_DIR, "runs", "observability")
LOG_PATH = os.path.join(OBS_DIR, "hooks.jsonl")
LEDGER_DIR = os.path.join(OBS_DIR, "ledgers")

def _mkdirs():
    pathlib.Path(OBS_DIR).mkdir(parents=True, exist_ok=True)
    pathlib.Path(LEDGER_DIR).mkdir(parents=True, exist_ok=True)

def _read_stdin_json() -> dict:
    data = sys.stdin.read()
    try:
        return json.loads(data) if data else {}
    except Exception:
        return {}

def _log(obj: dict) -> None:
    _mkdirs()
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")

def _load_yaml(p: str) -> dict:
    if not yaml:
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}

def _realpath(p: str) -> str:
    try:
        return os.path.realpath(p)
    except Exception:
        return p

def _within_project(path: str) -> bool:
    rp = _realpath(path)
    root = _realpath(PROJECT_DIR)
    # Allow inside project dir only
    return rp.startswith(root + os.sep) or rp == root

def _host_from(url: str) -> str:
    try:
        return urlparse(url).hostname or ""
    except Exception:
        return ""

def _now() -> float:
    return time.time()

def _session_ledger(session_id: str | None) -> str:
    sid = session_id or "unknown"
    return os.path.join(LEDGER_DIR, f"session-{sid}.json")

def _load_ledger(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"cost_usd": 0.0, "events": 0}

def _save_ledger(path: str, ledger: dict) -> None:
    _mkdirs()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(ledger, f, indent=2)

def _read_registry() -> dict:
    return _load_yaml(os.path.join(PROJECT_DIR, "mcp", "registry.yaml"))

def _read_policies() -> dict:
    return _load_yaml(os.path.join(PROJECT_DIR, "mcp", "policies.yaml"))

# -------------------- policy & safety checks --------------------

DANGEROUS_CMD_PATTERNS = [
    r"rm\s+-rf\s+/",
    r"sudo\s+",
    r"curl\s+[^\n]+?\|\s*(sh|bash)",
    r"Invoke-WebRequest[^\n]+?\|\s*iex",  # powershell
    r"scp\s+",
    r"ssh\s+",
    r"docker\s+(login|push)\b",
    r"kubectl\s+apply\b.*\s(-f|--filename)\s+.*prod",
]

PROTECTED_FILES = [
    ".env", ".env.local", ".env.production", "id_rsa", "id_ed25519",
]
PROTECTED_DIRS = [
    "node_modules", ".git", ".github", "runs", "reports", "coverage",
]

def is_secondary_tool(tool_id: str, registry: dict) -> bool:
    try:
        return (registry.get("tools", {}).get(tool_id, {}) or {}).get("tier") == "secondary"
    except Exception:
        return False

def tool_side_effects(tool_id: str, registry: dict) -> list[str]:
    try:
        return (registry.get("tools", {}).get(tool_id, {}) or {}).get("side_effects", []) or []
    except Exception:
        return []

def enforce_secondary_consent(tool_id: str, registry: dict) -> tuple[bool, str | None]:
    """Return (ok, reason). If not ok, caller should block with exit 2."""
    if not is_secondary_tool(tool_id, registry):
        return True, None
    # Consent switches: env or file
    if os.getenv("SECONDARY_CONSENT", "").lower() in ("1", "true", "yes"):
        return True, None
    consent_file = os.path.join(PROJECT_DIR, ".claude", "secondary_consent.txt")
    if os.path.exists(consent_file):
        return True, None
    return False, f"Tool '{tool_id}' is secondary and requires consent (set SECONDARY_CONSENT=true or add {consent_file})."

def safe_http_host(url: str) -> bool:
    """Allow localhost and hosts from STAGING_URL/API_BASE; block obvious prod domains by default."""
    host = _host_from(url)
    if not host:
        return True
    if host in ("localhost", "127.0.0.1", "::1"):
        return True
    allowed = set()
    for env_var in ("STAGING_URL", "API_BASE"):
        v = os.getenv(env_var)
        if v:
            h = _host_from(v)
            if h:
                allowed.add(h)
    if host in allowed:
        return True
    # Heuristic: block common prod-only markers unless explicitly allowed
    if any(part in host for part in (".prod.", "production", "live", "payments")):
        return False
    # Otherwise warn but allow; the Router should have already constrained tools.
    return True

def sanitize_write_target(path: str) -> tuple[bool, str | None]:
    """Ensure write/edit targets stay within project and avoid protected paths."""
    if not path:
        return True, None
    if not _within_project(path):
        return False, f"Write/Edit path is outside project: {path}"
    # deny protected files/dirs
    rp = _realpath(path)
    for name in PROTECTED_FILES:
        if rp.endswith(os.sep + name) or rp == os.path.join(_realpath(PROJECT_DIR), name):
            return False, f"Write/Edit to protected file is not allowed: {name}"
    for d in PROTECTED_DIRS:
        if (os.sep + d + os.sep) in rp:
            return False, f"Write/Edit in protected directory is not allowed: {d}"
    return True, None

def dangerous_shell(cmd: str) -> bool:
    cmd_l = cmd or ""
    for pat in DANGEROUS_CMD_PATTERNS:
        if re.search(pat, cmd_l, flags=re.IGNORECASE):
            return True
    return False

def estimate_cost_usd(tool_id: str, params: dict) -> float:
    # Conservative placeholders; refine per environment as needed.
    if tool_id in ("http", "fetch", "playwright", "lighthouse", "latency-sampler"):
        size = len(json.dumps(params, ensure_ascii=False)) if params else 100
        return min(0.001 + size/1_000_000, 0.01)
    return 0.0

def budget_guard(session_id: str | None, amount: float, policies: dict, tool_id: str) -> tuple[bool, float, str | None]:
    """Track a simple per-session budget for secondary tools; block if exceeding default budget."""
    if amount <= 0:
        return True, 0.0, None
    secondary_default = ((policies.get("tiers") or {}).get("secondary") or {}).get("default_budget_usd", 0.10)
    overrides = ((policies.get("tiers") or {}).get("secondary") or {}).get("budget_overrides", {})
    budget = float(overrides.get(tool_id, secondary_default))

    path = _session_ledger(session_id)
    ledger = _load_ledger(path)
    new_total = float(ledger.get("cost_usd", 0.0)) + amount
    if new_total > budget:
        return False, budget, f"Estimated secondary spend {new_total:.2f} > budget {budget:.2f}"
    ledger["cost_usd"] = new_total
    ledger["events"] = int(ledger.get("events", 0)) + 1
    _save_ledger(path, ledger)
    return True, budget, None

# -------------------- main --------------------

def main() -> int:
    inp = _read_stdin_json()

    # Try to accommodate multiple shapes of the hook payload
    tool_id = inp.get("tool_name") or inp.get("tool") or inp.get("name") or ""
    params = inp.get("tool_input") or inp.get("parameters") or inp.get("input") or {}
    session_id = inp.get("session_id") or inp.get("conversation_id") or inp.get("request_id")
    agent = os.getenv("CLAUDE_AGENT_NAME", "unknown")
    auv = os.getenv("AUV_ID")

    registry = _read_registry()
    policies = _read_policies()

    # Secondary consent (block if missing)
    ok, reason = enforce_secondary_consent(tool_id, registry)
    if not ok:
        _log({
            "ts": _now(), "event": "PreToolUse", "agent": agent, "auv": auv,
            "session_id": session_id, "tool": tool_id, "blocked": True, "reason": reason
        })
        sys.stderr.write(reason + "\n")
        return 2  # Claude Code will show the reason and skip

    # Tool-specific safety
    violations: list[str] = []

    # HTTP/Fetch URLs
    for key in ("url", "href", "endpoint"):
        v = params.get(key) if isinstance(params, dict) else None
        if isinstance(v, str) and v.startswith("http"):
            if not safe_http_host(v):
                violations.append(f"HTTP target not allowed in this environment: {v}")

    # Write/Edit: validate path inside project
    if tool_id.lower() in ("write", "edit", "write_file", "edit_file"):
        target = params.get("path") or params.get("file_path") or params.get("target")
        ok2, why = sanitize_write_target(target or "")
        if not ok2 and why:
            violations.append(why)

    # Shell/Run dangerous commands
    if tool_id.lower() in ("bash", "run", "shell", "powershell"):
        cmd = params.get("command") or params.get("cmd") or ""
        if dangerous_shell(cmd):
            violations.append("Dangerous shell pattern detected; command blocked by policy.")

    # Database guard (very light)
    if tool_id.lower() in ("postgres", "db.query", "database"):
        dsn = params.get("dsn") or os.getenv("DB_URL", "")
        if "prod" in (dsn or "").lower():
            violations.append("Refusing DB connection that appears to target production.")

    # Enrich defaults (timeouts, headers) without mutating input (best-effort advice only)
    # NOTE: Claude Code ignores stdout on success; we only log the enrichment for visibility.
    enrichments = {}
    if tool_id.lower() in ("http", "fetch") and isinstance(params, dict):
        if "timeout" not in params:
            enrichments["timeout"] = 30_000  # ms
        if "headers" not in params and os.getenv("API_BASE"):
            enrichments["headers"] = {"Accept": "application/json"}

    # Cost estimate + budget guard (only meaningful for secondary; harmless otherwise)
    est_cost = estimate_cost_usd(tool_id, params)
    cost_ok, budget, budget_reason = budget_guard(session_id, est_cost if is_secondary_tool(tool_id, registry) else 0.0, policies, tool_id)

    # Decide
    blocked = False
    reason_final = None
    if violations:
        blocked = True
        reason_final = "; ".join(violations)
    elif not cost_ok and budget_reason:
        blocked = True
        reason_final = budget_reason

    # Log
    _log({
        "ts": _now(),
        "event": "PreToolUse",
        "agent": agent,
        "auv": auv,
        "session_id": session_id,
        "tool": tool_id,
        "blocked": blocked,
        "reason": reason_final,
        "est_cost": round(est_cost, 6),
        "secondary": is_secondary_tool(tool_id, registry),
        "side_effects": tool_side_effects(tool_id, registry),
        "enrichments": enrichments or None,
        "params_keys": list(params.keys()) if isinstance(params, dict) else None
    })

    if blocked:
        if reason_final:
            sys.stderr.write(reason_final + "\n")
        return 2  # block this tool call

    # success → do not print anything (Claude ignores stdout), exit 0
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        # Never crash the IDE; log and allow (exit 0) to avoid wedging sessions.
        _log({"ts": _now(), "event": "PreToolUse", "error": str(e)})
        sys.exit(0)
