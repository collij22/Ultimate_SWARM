---
title: "SEO Audit + Narrative Report (Search → Fetch → Audit → Doc)"
project_context: |
  Client requests an actionable SEO audit for a small marketing site. The scope includes
  searching for the brand, fetching the first result, running a deterministic on-page audit,
  then generating a stakeholder-friendly report (MD/HTML). Allow TEST_MODE for fixture-based
  operation; support live mode when BRAVE_API_KEY is present.
business_goals:
  - Produce an on-page SEO audit with clear issues and recommendations.
  - Demonstrate a safe web.search pipeline with deterministic fallbacks.
  - Deliver a readable report artifact for stakeholders.
must_have:
  - web.search + web.fetch step with TEST_MODE fallback.
  - seo.audit JSON under reports/seo/audit.json.
  - doc.generate summary (MD/HTML) under reports/seo/.
nice_to_have:
  - Reference visuals for intent comparison in the final report.
constraints:
  budget_usd: 2000
  timeline_days: 5
  tech_stack: [brave-search, fetch, node]
  environments: [local, web]
sample_urls: ["https://example.com"]
references: []
---

## Overview

Audit a fetched page for titles, meta, canonicals, headings, links, images, OG tags, and
structured data. Generate a report summarizing issues and recommendations.

## Must-Have Features

- `web.search` with fixture fallback in TEST_MODE
- Deterministic `seo.audit` JSON
- `doc.generate` to MD/HTML

## Nice-to-Have Features

- Include reference visuals in report (optional)

## Constraints

- Budget: $2,000
- Timeline: 5 days
- Tech stack: Brave Search API optional, deterministic fixtures otherwise


