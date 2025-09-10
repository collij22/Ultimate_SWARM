# Capability: seo.audit — auditor recipe

## Inputs

- Start URL (default: `${STAGING_URL}`)
- Optional crawl artifact from `web.crawl`

## Steps

1. Fetch HTML; extract title, meta description, canonical, H1.
2. Validate presence/lengths and canonical correctness.
3. Optionally process small crawl set for broken links (<= 5 pages).
4. Emit `reports/seo/audit.json` and `reports/seo/summary.md`.

## Acceptance

- Required fields present; broken links ≤ threshold; sitemap found or justified.
