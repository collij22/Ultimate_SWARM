Due to problems with Claude hooks, some changes were implemented to fix:

-Implemented strict AUV_ID-only gating, HOOKS_MODE (off|warn|block), and a circuit breaker across all hooks; added a common helper to centralize safe I/O, gating, and offsets.
-Updated PreTool to support warn/block behavior and keep inert runs no-op; optimized SessionStart/End/SubagentStop to avoid heavy log scans using saved offsets and size caps; hardened all hooks to never crash the IDE.
-Documented the new behavior in docs/hooks.md.


What you can do now:
-For normal coding: keep hooks inert by not setting AUV_ID or by HOOKS_MODE=off.
-For orchestration runs (autopilot/DAG/CI): set AUV_ID and HOOKS_MODE=block (or warn first), e.g. the runbook already exports AUV_ID; set HOOKS_MODE=block in that environment.

Summary:
-Added scripts/hooks/common.py and refactored pre_tool.py, post_tool.py, session_start.py, session_end.py, and subagent_stop.py to use strict gating and resilient logging.
-Introduced env controls: HOOKS_MODE (off|warn|block), HOOKS_MAX_LOG_MB, HOOKS_ERROR_TRIP, CLAUDE_DISABLE_HOOKS.
-Updated docs/hooks.md to reflect AUV-only processing, modes, and safeguards.