#!/usr/bin/env python3
"""
Shared utilities for Swarm1 Claude Code hooks.
- Strict Swarm gating (AUV-only) and mode handling (off|warn|block)
- Error-tolerant JSONL logging and safe stdin parsing
- Circuit breaker to avoid IDE wedging when hooks fail repeatedly
- Session log offset utilities to avoid heavy scans
"""

from __future__ import annotations
import os, sys, json, time, pathlib
from typing import Any, Dict, Optional, Tuple


# ------------- Paths & Environment -------------

def project_root(start: str) -> str:
  cur = os.path.abspath(start)
  for _ in range(8):
    if os.path.isdir(os.path.join(cur, ".claude")) or os.path.isdir(os.path.join(cur, "mcp")):
      return cur
    parent = os.path.dirname(cur)
    if parent == cur:
      break
    cur = parent
  return os.getenv("CLAUDE_PROJECT_DIR") or os.getcwd()


PROJECT_DIR = project_root(os.getcwd())
OBS_DIR = os.path.join(PROJECT_DIR, "runs", "observability")
LOG_PATH = os.path.join(OBS_DIR, "hooks.jsonl")
LEDGER_DIR = os.path.join(OBS_DIR, "ledgers")
SESSION_DIR = os.path.join(PROJECT_DIR, ".claude", "session")
SENTINELS_DIR = os.path.join(PROJECT_DIR, ".claude")
CB_SENTINEL = os.path.join(SENTINELS_DIR, "hooks.disabled")


def mkdirs() -> None:
  pathlib.Path(OBS_DIR).mkdir(parents=True, exist_ok=True)
  pathlib.Path(LEDGER_DIR).mkdir(parents=True, exist_ok=True)
  pathlib.Path(SESSION_DIR).mkdir(parents=True, exist_ok=True)
  pathlib.Path(SENTINELS_DIR).mkdir(parents=True, exist_ok=True)


# ------------- Gating & Modes -------------

def is_swarm() -> bool:
  # Strict AUV-only gating; no SWARM_ACTIVE shortcut for processing
  return bool(os.getenv("AUV_ID"))


def get_mode() -> str:
  # off | warn | block (default to off for normal coding sessions)
  mode = (os.getenv("HOOKS_MODE") or "off").strip().lower()
  return mode if mode in ("off", "warn", "block") else "off"


def disabled() -> bool:
  if (os.getenv("CLAUDE_DISABLE_HOOKS", "").lower() in ("1", "true", "yes")):
    return True
  return os.path.exists(CB_SENTINEL)


# ------------- IO Helpers -------------

def safe_read_stdin_json() -> Dict[str, Any]:
  try:
    if getattr(sys.stdin, "isatty", lambda: False)():
      return {}
  except Exception:
    return {}
  data = sys.stdin.read()
  try:
    return json.loads(data) if data else {}
  except Exception:
    return {}


def safe_append_jsonl(obj: Dict[str, Any]) -> None:
  try:
    mkdirs()
    with open(LOG_PATH, "a", encoding="utf-8") as f:
      f.write(json.dumps(obj, ensure_ascii=False) + "\n")
  except Exception:
    # Never wedge IDE on logging failure
    return


# ------------- Circuit Breaker -------------

def _errors_file(session_id: Optional[str]) -> str:
  sid = session_id or "unknown"
  mkdirs()
  return os.path.join(SESSION_DIR, f"{sid}.errors.json")


def record_error(session_id: Optional[str], trip_after: int = None) -> bool:
  """Increment error count for this session. Return True if breaker should trip."""
  try:
    path = _errors_file(session_id)
    count = 0
    if os.path.exists(path):
      with open(path, "r", encoding="utf-8") as f:
        data = json.load(f) or {}
        count = int(data.get("count", 0))
    count += 1
    with open(path, "w", encoding="utf-8") as f:
      json.dump({"count": count, "ts": time.time()}, f)
    # Determine threshold
    default_trip = 3
    try:
      cfg_trip = int(os.getenv("HOOKS_ERROR_TRIP", "") or default_trip)
    except Exception:
      cfg_trip = default_trip
    threshold = trip_after if isinstance(trip_after, int) else cfg_trip
    return count >= threshold
  except Exception:
    return False


def trip_circuit_breaker() -> None:
  try:
    mkdirs()
    pathlib.Path(CB_SENTINEL).write_text("tripped\n", encoding="utf-8")
  except Exception:
    return


# ------------- Session Offsets -------------

def session_offset_path(session_id: Optional[str]) -> str:
  sid = session_id or "unknown"
  mkdirs()
  return os.path.join(SESSION_DIR, f"{sid}.offset.json")


def save_offset(session_id: Optional[str]) -> None:
  try:
    size = os.path.getsize(LOG_PATH) if os.path.exists(LOG_PATH) else 0
    with open(session_offset_path(session_id), "w", encoding="utf-8") as f:
      json.dump({"size": int(size), "ts": time.time()}, f)
  except Exception:
    return


def load_offset(session_id: Optional[str]) -> int:
  try:
    with open(session_offset_path(session_id), "r", encoding="utf-8") as f:
      data = json.load(f) or {}
      return int(data.get("size", 0))
  except Exception:
    return 0


# ------------- Config -------------

def max_log_bytes() -> int:
  # default 10 MB cap for heavy scans
  mb = 10
  try:
    mb_env = os.getenv("HOOKS_MAX_LOG_MB", "")
    if mb_env:
      mb = int(mb_env)
  except Exception:
    mb = 10
  return mb * 1024 * 1024



