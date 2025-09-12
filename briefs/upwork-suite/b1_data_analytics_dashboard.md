---
title: "E-commerce KPI Dashboard (CSV → Insights → Charts)"
project_context: |
  Client operates a small e‑commerce store and needs a lightweight KPI dashboard
  generated from periodic CSV exports. Deliver a verified, offline-friendly flow that
  ingests CSV, computes insights (top categories, AOV, totals), renders PNG charts,
  and writes a short summary report.
business_goals:
  - Generate a concise KPI report from provided CSV data to inform weekly decisions.
  - Produce simple visualizations (bar/line charts) suitable for slide decks.
  - Ensure outputs are deterministic and runnable locally and in CI.
must_have:
  - CSV ingest into local analytical store (no cloud dependency).
  - Insights JSON with totals, AOV, and top-3 categories.
  - At least one bar chart image (PNG) capturing category revenue.
  - Deterministic artifacts under runs/** for verification.
nice_to_have:
  - Additional charts by region and payment method.
  - Summary markdown or HTML snippet for stakeholders.
constraints:
  budget_usd: 2500
  timeline_days: 7
  tech_stack: [duckdb, node, chart.js]
  environments: [local, web]
sample_urls: []
references: []
---

## Overview

Weekly KPI generation from CSV with deterministic artifacts and simple charts. No external
APIs, no paid services. Artifacts must land under runs/** and reports/**.

## Must-Have Features

- CSV ingest → normalized data
- insights.json (metrics + top categories)
- charts/*.png (at least one bar chart)
- CI-friendly deterministic execution

## Nice-to-Have Features

- Region and payment-method breakdown charts
- Lightweight summary (markdown or HTML)

## Constraints

- Budget: $2,500
- Timeline: 7 days
- Tech stack: DuckDB, Node, Chart.js


