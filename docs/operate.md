## AUV-TEMPLATE — Operate

- Reset test data, view logs/metrics, rotate keys

## Hooks Operations & Environment Control

Swarm1 hooks provide observability and policy enforcement **only during orchestration runs**. They are inert during normal coding sessions to avoid performance overhead.

### Activation & Modes

Hooks activate **only** when `AUV_ID` is set (automatically done by runbook/CI). Control behavior via:

```bash
# For orchestration runs (autopilot, DAG, CI)
export AUV_ID=AUV-0003
export HOOKS_MODE=block    # Enforce policies (recommended for CI)

# Alternative modes
export HOOKS_MODE=warn     # Log violations but don't block
export HOOKS_MODE=off      # Disable completely (default)

# Run with hooks active
node orchestration/cli.mjs AUV-0003
```

### Environment Variables

| Variable | Purpose | Default | Example |
|----------|---------|---------|---------|
| `AUV_ID` | Activates hooks for this AUV | none | `AUV-0003` |
| `HOOKS_MODE` | Control enforcement | `off` | `off`, `warn`, `block` |
| `SECONDARY_CONSENT` | Allow paid/external tools | false | `true` |
| `HOOKS_MAX_LOG_MB` | Max log size to scan | 10 | `20` |
| `HOOKS_ERROR_TRIP` | Errors before circuit break | 3 | `5` |
| `CLAUDE_DISABLE_HOOKS` | Emergency disable | false | `true` |

### Monitoring Hooks Activity

```bash
# Check if hooks are active
tail -f runs/observability/hooks.jsonl | jq .

# View hook errors
jq 'select(.error)' runs/observability/hooks.jsonl

# Check which tools were blocked
jq 'select(.blocked == true)' runs/observability/hooks.jsonl

# Monitor session costs
cat runs/observability/ledgers/session-*.json | jq .cost_usd
```

### Troubleshooting Hooks

#### Hooks causing IDE issues?

```bash
# Emergency disable (creates sentinel file)
touch .claude/hooks.disabled

# Or via environment
export CLAUDE_DISABLE_HOOKS=true
```

#### Reset circuit breaker after errors:

```bash
# Remove error counts
rm .claude/session/*.errors.json

# Remove circuit breaker sentinel
rm .claude/hooks.disabled
```

#### Check hook health:

```bash
# Verify hooks only process during AUV runs
grep '"auv":null' runs/observability/hooks.jsonl | wc -l
# Should be 0 (no processing without AUV_ID)

# Check for repeated errors
jq -r '.error' runs/observability/hooks.jsonl | sort | uniq -c | sort -rn
```

### Best Practices

1. **Normal coding**: Leave `HOOKS_MODE` unset or `off`
2. **Local testing**: Use `HOOKS_MODE=warn` first, then `block`
3. **CI/Production**: Always use `HOOKS_MODE=block`
4. **Debugging**: Check `runs/observability/hooks.jsonl` for issues
5. **Performance**: Hooks add <50ms overhead when active, 0ms when inactive

## Bundle Verification & Operations (Phase 7)

### Verify Delivered Bundles

When receiving a Swarm1 delivery bundle, follow these steps to verify integrity and completeness:

#### 1. Extract and Verify Bundle

```bash
# Extract the bundle
unzip dist/AUV-XXXX/AUV-XXXX_bundle.zip -d /tmp/verify/

# Verify manifest exists
cat /tmp/verify/manifest.json | jq .version
# Expected: "1.1"

# Check bundle checksum
sha256sum dist/AUV-XXXX/AUV-XXXX_bundle.zip
# Compare with manifest.bundle.sha256
```

#### 2. Validate Manifest Schema

```bash
# Validate against schema
npx ajv validate \
  -s schemas/manifest.schema.json \
  -d dist/AUV-XXXX/manifest.json \
  --verbose

# Expected: Valid
```

#### 3. Verify Artifact Checksums

```bash
# Script to verify all artifacts
for artifact in $(jq -r '.artifacts[] | "\(.path):\(.sha256)"' manifest.json); do
  path=$(echo $artifact | cut -d: -f1)
  expected=$(echo $artifact | cut -d: -f2)
  actual=$(sha256sum "/tmp/verify/$path" | cut -d' ' -f1)
  
  if [ "$expected" = "$actual" ]; then
    echo "✅ $path"
  else
    echo "❌ $path - checksum mismatch!"
    exit 1
  fi
done
```

#### 4. Review SBOM for Vulnerabilities

```bash
# Extract SBOM from manifest
jq '.sbom' dist/AUV-XXXX/manifest.json > sbom.json

# Check for known vulnerabilities (requires grype or similar)
grype sbom:sbom.json

# Review dependencies
jq '.packages[] | "\(.name)@\(.version)"' sbom.json
```

#### 5. Verify Provenance

```bash
# Check build provenance
jq '.provenance' dist/AUV-XXXX/manifest.json

# Verify git commit exists
git show $(jq -r '.provenance.git_commit' manifest.json)

# Check CI run link
jq -r '.provenance.ci_run' manifest.json
# Open in browser to verify CI passed
```

### View Delivery Report

The HTML report provides a visual summary:

```bash
# Open report in browser
open dist/AUV-XXXX/report.html

# Or serve locally
python3 -m http.server 8080 --directory dist/AUV-XXXX/
# Navigate to http://localhost:8080/report.html
```

Report sections to review:
- **Executive Summary**: Overall status and scores
- **Build Information**: Git commit, branch, CI details
- **Performance Metrics**: Lighthouse scores vs budgets
- **Visual Proofs**: Screenshot gallery
- **Artifacts Inventory**: Complete file list with sizes

### Re-run Verification

To re-verify an AUV from its artifacts:

```bash
# Re-run CVF check from artifacts
node orchestration/cvf-check.mjs AUV-XXXX --from-bundle dist/AUV-XXXX/AUV-XXXX_bundle.zip

# Re-generate report from manifest
node orchestration/cli.mjs report AUV-XXXX
```

### Bundle Distribution

#### Via GitHub Releases

```bash
# Create release with bundle
gh release create v1.0.0-AUV-XXXX \
  dist/AUV-XXXX/AUV-XXXX_bundle.zip \
  dist/AUV-XXXX/manifest.json \
  dist/AUV-XXXX/report.html \
  --title "AUV-XXXX Delivery" \
  --notes "Verified delivery bundle for AUV-XXXX"
```

#### Via S3/Cloud Storage

```bash
# Upload to S3 with checksums
aws s3 cp dist/AUV-XXXX/ s3://deliveries/AUV-XXXX/ \
  --recursive \
  --metadata-directive REPLACE \
  --metadata sha256=$(sha256sum dist/AUV-XXXX/AUV-XXXX_bundle.zip | cut -d' ' -f1)
```

### Troubleshooting

#### Missing Artifacts

If manifest references missing artifacts:

```bash
# List missing artifacts
for path in $(jq -r '.artifacts[].path' manifest.json); do
  [ ! -f "/tmp/verify/$path" ] && echo "Missing: $path"
done

# Re-collect from runs directory
node orchestration/cli.mjs package AUV-XXXX --rebuild
```

#### Checksum Mismatches

If checksums don't match:

```bash
# Check for file corruption
file dist/AUV-XXXX/AUV-XXXX_bundle.zip

# Re-download if corrupted
gh release download v1.0.0-AUV-XXXX

# Or rebuild from source
node orchestration/cli.mjs deliver AUV-XXXX
```

#### Invalid Manifest

If manifest validation fails:

```bash
# Check schema version
jq '.version' manifest.json

# Validate with detailed errors
npx ajv validate \
  -s schemas/manifest.schema.json \
  -d manifest.json \
  --all-errors \
  --verbose

# Regenerate if needed
node orchestration/cli.mjs package AUV-XXXX --force
```

### Monitoring & Alerts

Set up monitoring for delivered bundles:

```bash
# Check bundle age
find dist/ -name "*_bundle.zip" -mtime +30 -exec echo "Old bundle: {}" \;

# Monitor bundle sizes
du -sh dist/*/\*_bundle.zip | sort -h

# Alert on missing reports
for dir in dist/AUV-*; do
  [ ! -f "$dir/report.html" ] && echo "Missing report: $dir"
done
```

### Security Considerations

1. **Never commit bundles to git** - Use .gitignore for dist/
2. **Verify signatures** when implemented (Phase 8)
3. **Scan SBOM** for vulnerabilities before distribution
4. **Rotate credentials** after bundle creation
5. **Use secure channels** for bundle distribution

### Retention Policy

Recommended retention:
- **Development bundles**: 7 days
- **Staging bundles**: 30 days  
- **Production bundles**: 90 days
- **Manifests only**: Indefinite

Clean up old bundles:

```bash
# Remove bundles older than 30 days
find dist/ -name "*_bundle.zip" -mtime +30 -delete

# Keep manifests and reports
find dist/ -name "*_bundle.zip" -mtime +30 -delete
```
