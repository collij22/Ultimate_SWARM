---
title: "Cloud DB Schema + Roundtrip (Demo)"
project_context: |
  Client asks for a simple demo that validates connectivity to a cloud DB (simulated in
  TEST_MODE), performs a roundtrip query, and optionally emits a schema artifact. Live
  mode would require SUPABASE_SERVICE_KEY, but default path uses deterministic stubs.
business_goals:
  - Provide a safe, deterministic demonstration of cloud DB connectivity.
  - Emit artifacts for connectivity, query roundtrip, and optional schema.
  - Produce a short database report document.
must_have:
  - cloud.db (TEST_MODE) emitting connectivity.json and roundtrip.json
  - doc.generate database_report (MD/HTML)
nice_to_have:
  - create_schema operation producing schema.json
constraints:
  budget_usd: 1800
  timeline_days: 4
  tech_stack: [supabase]
  environments: [local]
sample_urls: []
references: []
---

## Overview

Run a safe demo of DB connectivity and roundtrip, then generate a report. Default to
TEST_MODE stubs; live requires explicit keys and consent.

## Must-Have Features

- cloud.db → connectivity + roundtrip artifacts
- doc.generate → database_report (MD/HTML)

## Nice-to-Have Features

- create_schema with configurable tables

## Constraints

- Budget: $1,800
- Timeline: 4 days
- Tech: Supabase (optional live)


