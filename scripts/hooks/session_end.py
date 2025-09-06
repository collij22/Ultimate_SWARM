#!/usr/bin/env python3
"""
Swarm1 - Claude Code SessionEnd hook
- Rolls up a brief summary for the session (counts per tool, failures)
- Writes a result-card JSON under runs/<AUV-ID>/result-cards/session-<id>.json
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

def _read_stdin_json() -> dict:
    try:
        # If stdin is a TTY (no pipe), don't read or we'll block the terminal.
        if getattr(sys.stdin, "isatty", lambda: False)():
            return {}
    except Exception:
        return {}
    data = sys.stdin.read()
    try:
        return json.loads(data) if data else {}
    except Exception:
        return {}


def _iter_jsonl(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                try:
                    yield json.loads(line)
                except Exception:
                    continue
    except FileNotFoundError:
        return

def main() -> int:
    inp = _read_stdin_json()
    session_id = inp.get("session_id") or inp.get("conversation_id") or inp.get("request_id")
    agent = os.getenv("CLAUDE_AGENT_NAME", "unknown")
    auv = os.getenv("AUV_ID")
    
    # SWARM MODE GATE: Only process session summaries during orchestration workflows
    swarm_active = bool(auv) or os.getenv("SWARM_ACTIVE", "").lower() in ("1", "true", "yes")
    if not swarm_active:
        # Skip session processing for regular Claude Code usage to avoid expensive log parsing
        return 0

    # Aggregate counts from hooks.jsonl
    per_tool = {}
    failures = 0
    total = 0
    for evt in _iter_jsonl(LOG_PATH):
        if evt.get("session_id") != session_id:
            continue
        if evt.get("event") == "PostToolUse":
            t = evt.get("tool") or "unknown"
            bucket = per_tool.setdefault(t, {"ok": 0, "fail": 0})
            if evt.get("ok"):
                bucket["ok"] += 1
            else:
                bucket["fail"] += 1
                failures += 1
            total += 1

    # Write session card if AUV_ID set
    if auv:
        cards_dir = os.path.join(PROJECT_DIR, "runs", auv, "result-cards")
        pathlib.Path(cards_dir).mkdir(parents=True, exist_ok=True)
        card_path = os.path.join(cards_dir, f"session-{session_id or int(time.time())}.json")
        with open(card_path, "w", encoding="utf-8") as f:
            json.dump({
                "ts": time.time(),
                "event": "SessionEnd",
                "session_id": session_id,
                "agent": agent,
                "summary": {
                    "total_tools": total,
                    "failures": failures,
                    "per_tool": per_tool
                }
            }, f, indent=2)

    # Append a final log line
    pathlib.Path(OBS_DIR).mkdir(parents=True, exist_ok=True)
    with open(os.path.join(OBS_DIR, "hooks.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps({
            "ts": time.time(),
            "event": "SessionEnd",
            "session_id": session_id,
            "agent": agent,
            "auv": auv,
            "summary_total": total,
            "summary_failures": failures
        }) + "\n")

    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
