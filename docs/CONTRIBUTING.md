# Contributing to Swarm1

## Development flow

1. Create/extend an **AUV** in `capabilities/`.
2. Update contracts in `contracts/*` as needed (OpenAPI/AsyncAPI).
3. Build minimal vertical slice; keep diffs small.
4. Add/adjust **Robot** tests and **verify** steps.
5. Run gates locally (CVF/QA/Security) before PR.

## PR checklist (short)

- [ ] AUV spec updated/added
- [ ] Contracts updated (OpenAPI/AsyncAPI) or confirmed unchanged
- [ ] Robot tests pass locally; artifacts present under `runs/`
- [ ] Docs updated (`docs/verify.md`, CHANGELOG)
- [ ] Security & QA gates green (or waivers with expiry)

## Code style

- Keep prompts & policies declarative; prefer **capabilities** over tool names.
- Keep changes **AUV‑sized**, reversible, and well‑documented.
