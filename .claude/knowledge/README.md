# Knowledge Assets

This directory contains reusable knowledge assets for agents to improve consistency and quality.

## Structure

- **exemplars/** - High-quality example outputs from successful agent runs
- **patterns/** - Reusable design patterns and architectural templates
- **templates/** - Code templates and scaffolding
- **domain/** - Domain-specific knowledge (e-commerce, SaaS, etc.)

## Usage

Build the knowledge index:

```bash
node orchestration/cli.mjs knowledge build-index
```

The indexer will scan this directory and create a searchable index at `reports/knowledge/index.json`.

## Adding Knowledge

Place files in the appropriate subdirectory:

- Exemplars: JSON files with successful agent outputs
- Patterns: Markdown or YAML files describing patterns
- Templates: Code files with placeholders
- Domain: Reference documents and specifications
