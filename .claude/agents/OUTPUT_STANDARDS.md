# Agent Output Standards (v1.0)

All agents MUST emit a JSON output conforming to `schemas/agent-output.schema.json`.

## Minimal valid output

```json
{
  "version": "1.0",
  "ts": 1736467200,
  "agent_id": "B7.rapid_builder",
  "capabilities": ["browser.automation"],
  "outputs": { "result_card": { "summary": "ok" } },
  "ok": true
}
```

## Changeset format (optional)

`outputs.changeset` must follow `schemas/agent-changeset.schema.json`.

```json
{
  "files": [
    {
      "path": "docs/README.md",
      "action": "modify",
      "patch": "*** simulated diff ***"
    }
  ]
}
```

## Escalation (optional)

Use `schemas/agent-escalation.schema.json` when blocked.

```json
{
  "reason": "Need access to staging API",
  "requests": ["Provide API key via ENV"],
  "impact": "Cannot proceed with API tests",
  "proposed_next_actions": ["Unblock with test token"]
}
```
