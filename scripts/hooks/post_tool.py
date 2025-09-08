#!/usr/bin/env python3
"""
Swarm1 - Claude Code PostTool hook
- Reads hook input as JSON from stdin
- Logs sanitized tool responses and basic metrics
- Appends a JSON line to runs/observability/hooks.jsonl
"""
from __future__ import annotations
import sys, os, json, time, re, pathlib
sys.path.insert(0, os.path.dirname(__file__))
import common  # type: ignore

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
SECRET_PAT = re.compile(r'(api[_-]?key|token|password|secret)["\']?\s*[:=]\s*["\']?([A-Za-z0-9._-]{10,})', re.I)

def _mkdirs():
    pathlib.Path(OBS_DIR).mkdir(parents=True, exist_ok=True)

def _read_stdin_json() -> dict:
    return common.safe_read_stdin_json()

def _log(obj: dict) -> None:
    common.safe_append_jsonl(obj)

def redact_text(s: str) -> str:
    return SECRET_PAT.sub(r'\1:REDACTED', s)

def main() -> int:
    inp = _read_stdin_json()

    tool = inp.get("tool_name") or inp.get("tool") or ""
    session_id = inp.get("session_id") or inp.get("conversation_id") or inp.get("request_id")
    agent = os.getenv("CLAUDE_AGENT_NAME", "unknown")
    auv = os.getenv("AUV_ID")

    # Strict gating
    if common.disabled() or (not common.is_swarm()):
        return 0
    mode = common.get_mode()
    if mode == "off":
        return 0
    if not session_id:
        return 0

    response = inp.get("tool_response")
    ok = response is not None and str(response).lower().strip()[:5] not in ("error", "fail ")
    # Compute tiny metrics
    request_size = len(json.dumps(inp.get("tool_input", {}))) if isinstance(inp.get("tool_input"), (dict, list)) else 0
    response_size = len(json.dumps(response)) if response is not None else 0

    # sanitize a short snippet for logs
    snippet = json.dumps(response, ensure_ascii=False) if response is not None else ""
    snippet = snippet[:1000]
    snippet = redact_text(snippet)

    _log({
        "ts": time.time(),
        "event": "PostToolUse",
        "session_id": session_id,
        "agent": agent,
        "auv": auv,
        "tool": tool,
        "ok": ok,
        "request_size": request_size,
        "response_size": response_size,
        "response_snippet": snippet
    })

    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        # Never wedge the IDE
        try:
            _log({"ts": time.time(), "event": "PostToolUse", "error": str(e)})
        except Exception:
            pass
        # Circuit breaker (best-effort, no session id available here)
        try:
            if common.record_error(None):
                common.trip_circuit_breaker()
        except Exception:
            pass
        sys.exit(0)
