#!/usr/bin/env python3
"""
Swarm1 - Claude Code SubagentStop hook
- Creates a small 'result card' summarizing the sub-agent's work
- Pulls stats from the observability log for the current session_id + agent
"""
from __future__ import annotations
import sys, os, json, time, pathlib
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

def _read_stdin_json() -> dict:
    return common.safe_read_stdin_json()

def _iter_jsonl(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line=line.strip()
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
    auv = os.getenv("AUV_ID") or "AUV-unknown"

    # Strict gating
    if common.disabled() or (not common.is_swarm()):
        return 0
    mode = common.get_mode()
    if mode == "off":
        return 0

    per_tool = {}
    failures = 0
    total = 0
    for evt in _iter_jsonl(LOG_PATH):
        if evt.get("session_id") != session_id:
            continue
        if evt.get("event") != "PostToolUse":
            continue
        if evt.get("agent") != agent:
            continue
        t = evt.get("tool") or "unknown"
        bucket = per_tool.setdefault(t, {"ok": 0, "fail": 0})
        if evt.get("ok"):
            bucket["ok"] += 1
        else:
            bucket["fail"] += 1
            failures += 1
        total += 1

    # Write a subagent result card
    cards_dir = os.path.join(PROJECT_DIR, "runs", auv, "result-cards")
    pathlib.Path(cards_dir).mkdir(parents=True, exist_ok=True)
    card_path = os.path.join(cards_dir, f"subagent-{agent}-{session_id or int(time.time())}.json")
    try:
        with open(card_path, "w", encoding="utf-8") as f:
            json.dump({
                "ts": time.time(),
                "event": "SubagentStop",
                "session_id": session_id,
                "agent": agent,
                "auv": auv,
                "summary": {
                    "total_tools": total,
                    "failures": failures,
                    "per_tool": per_tool
                }
            }, f, indent=2)
    except Exception:
        pass

    # Also append a log line
    pathlib.Path(OBS_DIR).mkdir(parents=True, exist_ok=True)
    try:
        with open(os.path.join(OBS_DIR, "hooks.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "ts": time.time(),
                "event": "SubagentStop",
                "session_id": session_id,
                "agent": agent,
                "auv": auv,
                "summary_total": total,
                "summary_failures": failures
            }) + "\n")
    except Exception:
        pass

    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Circuit breaker (session_id unknown here)
        try:
            if common.record_error(None):
                common.trip_circuit_breaker()
        except Exception:
            pass
        sys.exit(0)
