#!/usr/bin/env python3
"""
Swarm1 - Claude Code SessionStart hook
- Records a single JSON line marking session start with environment snapshot
- Initializes a per-session ledger file (used by PreTool for budgets)
"""
from __future__ import annotations
import sys, os, json, time, pathlib

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

def _session_ledger(session_id: str | None) -> str:
  sid = session_id or "unknown"
  return os.path.join(LEDGER_DIR, f"session-{sid}.json")

def main() -> int:
  inp = _read_stdin_json()
  session_id = inp.get("session_id") or inp.get("conversation_id") or inp.get("request_id")
  agent = os.getenv("CLAUDE_AGENT_NAME", "unknown")
  auv = os.getenv("AUV_ID")

  # Initialize ledger (reset per session)
  _mkdirs()
  ledger_path = _session_ledger(session_id)
  with open(ledger_path, "w", encoding="utf-8") as f:
    json.dump({"cost_usd": 0.0, "events": 0}, f)

  # Log start
  _log({
    "ts": time.time(),
    "event": "SessionStart",
    "session_id": session_id,
    "agent": agent,
    "auv": auv,
    "env": {
      "STAGING_URL": os.getenv("STAGING_URL"),
      "API_BASE": os.getenv("API_BASE")
    }
  })
  return 0

if __name__ == "__main__":
  try:
    sys.exit(main())
  except Exception:
    sys.exit(0)
