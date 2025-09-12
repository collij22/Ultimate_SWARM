---
title: "Payments Demo (Test) → Receipt Document"
project_context: |
  Client wants a demonstration of a payments confirmation workflow using test-mode only
  (no live charges). Generate a synthetic payment intent and receipt, then produce a
  human-readable receipt document. Live mode should require STRIPE_API_KEY (test key),
  but the default CI/test path uses TEST_MODE for deterministic artifacts.
business_goals:
  - Show a complete, verifiable payments demo without real charges.
  - Produce a receipt in MD/HTML for stakeholder review.
  - Ensure deterministic outputs for CI.
must_have:
  - payments.test capability (TEST_MODE artifacts under runs/payments_demo).
  - doc.generate receipt (MD/HTML) under runs/tenants/default/payments_demo/ and/or reports/.
nice_to_have:
  - Include amount/currency parameters via inputs.
constraints:
  budget_usd: 1500
  timeline_days: 3
  tech_stack: [stripe]
  environments: [local]
sample_urls: []
references: []
---

## Overview

Synthesize a payment intent and generate a receipt document. Default path: TEST_MODE.
Optionally, allow live test keys when explicitly configured.

## Must-Have Features

- payments.test → payment_intent.json + charge.json
- doc.generate → receipt.md/html

## Nice-to-Have Features

- Parameterized amount and currency

## Constraints

- Budget: $1,500
- Timeline: 3 days
- Tech: Stripe test mode only by default


