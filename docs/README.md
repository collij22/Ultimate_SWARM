# Swarm1 Docs Index

- **SWARM1-GUIDE.md** — Strategy & principles (11 sections) mapping to concrete files.
- **ARCHITECTURE.md** — Big picture diagram and components.
- **ORCHESTRATION.md** — AUV lifecycle & lane scheduling (parallelization/serialization).
- **QUALITY-GATES.md** — CVF, QA, Security definitions & thresholds (Phase 11 adds domain-specific gates for Data/Charts/SEO/Media/DB with strict mode auto-detection and configurable thresholds).
- **verify.md** — Per‑AUV verification steps (updated with Phase 11 domain checks and pass criteria).
  - Phase 13 verification includes Secondary demos (firecrawl, stripe, supabase, tts-cloud) in both deterministic and claude modes, with tenant‑scoped artifact paths and new doc.generate templates.
- **runbook.md** — How to run the slice (local/staging).
- **operate.md** — Day‑2 operations (logs, metrics, rollback).
- **CHANGELOG.md** — Keep‑a‑Changelog + SemVer.
- **releases/** — Release notes per version.

**Related**

- **/mcp/** — Registry (v2) & policies (router).
- **/capabilities/** — AUV specs.
- **/orchestration/** — Policies & CVF gate.
