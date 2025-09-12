## Upwork Suite — 5 Briefs, 4 Scenarios

This suite stress‑tests Swarm1 across deterministic and subagent modes, with TEST_MODE on/off.

### Prerequisites

- ffmpeg installed and available on PATH (required for `video.compose`).
  - Windows: install ffmpeg (e.g., from `https://www.gyan.dev/ffmpeg/builds/`) and add `ffmpeg\bin` to PATH.
  - macOS (Homebrew): `brew install ffmpeg`
  - Linux (Debian/Ubuntu): `sudo apt-get update && sudo apt-get install -y ffmpeg`

### Briefs (high‑level)

1) Data Analytics Dashboard: CSV → insights.json → charts/*.png
2) SEO Audit + Report: web.search/fetch → seo.audit → doc.generate
3) Payments Demo (Test): payments.test → receipt (MD/HTML)
4) Cloud DB Schema + Roundtrip: cloud.db → database_report (MD/HTML)
5) Media Narration + Video: audio.tts → video.compose → media_report

### Run all scenarios

```
node scripts/run_upwork_suite.mjs
```

This executes each brief in:
- SWARM_MODE=deterministic, TEST_MODE=true
- SWARM_MODE=deterministic, TEST_MODE=false
- SWARM_MODE=claude, TEST_MODE=true
- SWARM_MODE=claude, TEST_MODE=false

Expected behavior:
- payments.test and cloud.db use safe deterministic stubs in this suite; we enforce success via artifact checks (receipts, db reports).

### API keys (optional)

- BRAVE_API_KEY: enables live web.search; otherwise fixtures are used.
- STRIPE_API_KEY: only for live test mode (not required here; default uses TEST_MODE stubs).
- SUPABASE_SERVICE_KEY: only for live mode (not required here; default uses TEST_MODE stubs).

### Monitoring and deliverables

- Logs per run: `runs/upwork-suite/logs/*.log`
- Suite summaries:
  - JSON: `runs/upwork-suite/suite-summary.json`
  - Markdown table: `runs/upwork-suite/suite-summary.md`
- Live events: `runs/observability/hooks.jsonl`
- Graph artifacts (examples):
  - Data: `runs/tenants/default/data/processed/normalized.json`, `charts/bar.png`
  - SEO: `reports/seo/audit.json`, `reports/seo/summary.{md,html}`
  - Payments: `runs/tenants/default/payments_demo/payment_intent.json`, `receipt.{md,html}`
  - Cloud DB: `runs/tenants/default/db_demo/{connectivity.json,roundtrip.json,schema.json}`, `reports/db/summary.{md,html}`
  - Media: `media/narration.wav`, `media/final.mp4`, `reports/media/production_report.{md,html}`

Windows live tail (PowerShell):

```
Get-Content -Path runs/observability/hooks.jsonl -Tail 200 -Wait
```

Unix-like live tail:

```
tail -n 200 -f runs/observability/hooks.jsonl
```


