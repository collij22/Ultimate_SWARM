# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- AUV template and scaffolding for capability-driven development.
- MCP router policies and registry (v2) with capabilities & budgets.

### Changed
- N/A

### Fixed
- N/A

### Security
- N/A

## [0.1.0] - 2025-09-04
### Added
- Initial Swarm1 repository layout and contracts:
  - `contracts/openapi.yaml` baseline with `/health` endpoint.
  - `contracts/events.yaml` (AsyncAPI) with `cart.item.added.v1` sample.
- Core docs: `runbook.md`, `verify.md`, `operate.md`, `ARCHITECTURE.md`, and this `CHANGELOG.md`.
- MCP configuration: `mcp/policies.yaml`, `mcp/registry.yaml`.
- Test harness folders under `tests/` and robot structure for UI/API/visual.
- Orchestrator & agent prompts for core roles (A/B/C series) and aux agents.

### Changed
- None yet.

### Fixed
- None yet.

### Security
- Security policy defaults in `mcp/policies.yaml` (no prod by default, secret redaction).
