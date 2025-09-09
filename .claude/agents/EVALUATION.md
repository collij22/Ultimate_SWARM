# Agent Evaluation (Phase 9)

Agents are evaluated on synthetic tasks with deterministic grading. Use:

```bash
node orchestration/cli.mjs agents score --agent <ID>
```

- Scorecards: `runs/agents/scorecards/<AGENT-ID>.json`
- Threshold: average score ≥ 0.85 (configurable)
- Dimensions: correctness, quality, safety, budget adherence, determinism

Fast-tier synthetic task example is provided under `tests/agents/synthetic/`.
