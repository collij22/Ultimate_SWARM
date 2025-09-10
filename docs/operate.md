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

| Variable               | Purpose                      | Default | Example                |
| ---------------------- | ---------------------------- | ------- | ---------------------- |
| `AUV_ID`               | Activates hooks for this AUV | none    | `AUV-0003`             |
| `HOOKS_MODE`           | Control enforcement          | `off`   | `off`, `warn`, `block` |
| `SECONDARY_CONSENT`    | Allow paid/external tools    | false   | `true`                 |
| `HOOKS_MAX_LOG_MB`     | Max log size to scan         | 10      | `20`                   |
| `HOOKS_ERROR_TRIP`     | Errors before circuit break  | 3       | `5`                    |
| `CLAUDE_DISABLE_HOOKS` | Emergency disable            | false   | `true`                 |

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

## Phase 10a Operations Notes

- Router Coverage Report
  - Generate: `node mcp/router-report.mjs`
  - Location: `runs/router/coverage-report.json`

- Search & Fetch (tangible proof)
  - CLI: `node orchestration/cli.mjs search-fetch "<query>"`
  - Artifacts: `runs/websearch_demo/{summary.json, brave_search.json, first_result.html, first_result_snippet.txt}`
  - Env: `BRAVE_API_KEY` required; router planning for `web.search` typically requires `TEST_MODE=true`.

## Bundle Verification & Operations (Phase 7)

### Verify Delivered Bundles

When receiving a Swarm1 delivery bundle, follow these steps to verify integrity and completeness:

#### 1. Extract and Verify Bundle

```bash
# Extract the bundle
unzip dist/AUV-XXXX/package.zip -d /tmp/verify/

# Verify manifest exists
cat /tmp/verify/manifest.json | jq .version
# Expected: "1.1"

# Check bundle checksum
sha256sum dist/AUV-XXXX/package.zip
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
node orchestration/cvf-check.mjs AUV-XXXX --from-bundle dist/AUV-XXXX/package.zip

# Re-generate report from manifest
node orchestration/cli.mjs report AUV-XXXX
```

### Bundle Distribution

#### Via GitHub Releases

```bash
# Create release with bundle
gh release create v1.0.0-AUV-XXXX \
  dist/AUV-XXXX/package.zip \
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
  --metadata sha256=$(sha256sum dist/AUV-XXXX/package.zip | cut -d' ' -f1)
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
file dist/AUV-XXXX/package.zip

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
find dist/ -name "package.zip" -mtime +30 -exec echo "Old bundle: {}" \;

# Monitor bundle sizes
du -sh dist/*/package.zip | sort -h

# Alert on missing reports
for dir in dist/AUV-*; do
  [ ! -f "$dir/report.html" ] && echo "Missing report: $dir"
done
```

## Durable Execution Engine Operations (Phase 8)

### Engine Prerequisites

Before starting the engine, ensure Redis is available:

```bash
# Check Redis connectivity
redis-cli ping
# Expected: PONG

# Or start Redis locally
docker run -d -p 6379:6379 redis:7-alpine

# Set custom Redis URL if needed
export REDIS_URL=redis://localhost:6379
```

### Starting the Engine

#### Development Mode

```bash
# Start worker with default settings
node orchestration/cli.mjs engine start

# With custom concurrency
ENGINE_CONCURRENCY=5 node orchestration/cli.mjs engine start

# With debug logging
DEBUG=bullmq:* node orchestration/cli.mjs engine start
```

#### Production Mode

```bash
# Production configuration
NODE_ENV=production \
REDIS_URL=redis://redis.prod:6379 \
ENGINE_CONCURRENCY=3 \
ENGINE_JOB_TIMEOUT=600000 \
node orchestration/cli.mjs engine start
```

### Monitoring Engine Health

#### Real-time Monitoring

```bash
# Monitor queue status (updates every 5s)
node orchestration/cli.mjs engine monitor

# View detailed status report
node orchestration/cli.mjs engine status

# Export status for external monitoring
node orchestration/cli.mjs engine emit-status | \
  jq '.engine.health.status'
```

#### Health Checks

```bash
# Check Redis connection
redis-cli ping

# Check queue responsiveness
node orchestration/cli.mjs engine status | \
  jq '.engine.health.checks'

# Monitor worker count
node orchestration/cli.mjs engine status | \
  jq '.engine.queue.workers.count'
```

### Managing Jobs

#### Enqueue Jobs

```bash
# Submit graph execution job
node orchestration/cli.mjs engine enqueue run_graph \
  --graph orchestration/graph/projects/demo-01.yaml \
  --tenant default

# High priority job
node orchestration/cli.mjs engine enqueue run_graph \
  --graph critical-job.yaml \
  --priority 10 \
  --tenant acme-corp

# With metadata for tracking
node orchestration/cli.mjs engine enqueue compile_brief \
  --brief briefs/project.md \
  --metadata '{"project":"Q1-2025","owner":"team@example.com"}'
```

#### Monitor Job Progress

```bash
# List active jobs
node orchestration/cli.mjs engine list

# Check specific job
node orchestration/cli.mjs engine status | \
  jq '.tenants.default.recent_runs[] | select(.job_id=="job-abc123")'

# View job metrics
node orchestration/cli.mjs engine metrics
```

#### Cancel Jobs

```bash
# Cancel specific job
node orchestration/cli.mjs engine cancel job-abc123

# Pause all processing
node orchestration/cli.mjs engine pause

# Resume processing
node orchestration/cli.mjs engine resume
```

### Multi-Tenant Management

#### View Tenant Status

```bash
# Check all tenant metrics
node orchestration/cli.mjs engine status | \
  jq '.tenants'

# Specific tenant metrics
node orchestration/cli.mjs engine status | \
  jq '.tenants["acme-corp"].metrics'

# Tenant storage usage
node orchestration/cli.mjs engine status | \
  jq '.tenants[].storage'
```

#### Monitor Tenant Quotas

```bash
# Check budget usage
tail -f runs/observability/hooks.jsonl | \
  jq 'select(.event == "EnginePolicyViolation")'

# View tenant resource limits
cat mcp/policies.yaml | \
  yq '.tenants["acme-corp"].resource_limits'

# Check concurrent job limits
node orchestration/cli.mjs engine status | \
  jq '.tenants["acme-corp"].metrics.active_jobs'
```

### Troubleshooting Engine Issues

#### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -h redis.host -p 6379 ping

# Check Redis memory
redis-cli info memory | grep used_memory_human

# Clear stuck jobs (CAUTION: data loss)
redis-cli FLUSHDB
```

#### Worker Issues

```bash
# Check worker errors
tail -f runs/observability/hooks.jsonl | \
  jq 'select(.event | startswith("EngineJob"))'

# Restart worker with clean state
pkill -f "engine start"
node orchestration/cli.mjs engine start

# Check for orphaned processes
ps aux | grep "bullmq"
```

#### Job Failures

```bash
# Find failed jobs
node orchestration/cli.mjs engine status | \
  jq '.engine.queue.counts.failed'

# View failure reasons
tail -100 runs/observability/hooks.jsonl | \
  jq 'select(.event == "EngineJobFailed")'

# Retry failed jobs (if configured)
# Jobs retry automatically based on config
```

### Backup & Recovery

#### Create Backups

```bash
# Manual backup
node orchestration/cli.mjs engine backup

# Automated daily backup (cron)
0 2 * * * node /path/to/orchestration/cli.mjs engine backup

# With S3 upload
S3_BUCKET=my-backups node orchestration/cli.mjs engine backup
```

#### List & Manage Backups

```bash
# List available backups
node orchestration/cli.mjs engine backup --list

# Clean old backups (keep last 5)
node orchestration/cli.mjs engine backup --clean

# Restore from backup (manual process)
tar -xzf backups/swarm1-backup-2025-01-09.tar.gz -C /
```

### Performance Tuning

#### Optimize Concurrency

```bash
# Monitor CPU/memory during processing
top -p $(pgrep -f "engine start")

# Adjust concurrency based on load
ENGINE_CONCURRENCY=2 node orchestration/cli.mjs engine start  # Light load
ENGINE_CONCURRENCY=8 node orchestration/cli.mjs engine start  # Heavy load
```

#### Queue Metrics

```bash
# View processing rates
node orchestration/cli.mjs engine metrics | \
  jq '.processing_rate_per_minute'

# Check average job duration
node orchestration/cli.mjs engine status | \
  jq '.tenants[].metrics.avg_duration_ms'

# Monitor queue depth
watch -n 5 'node orchestration/cli.mjs engine status | \
  jq ".engine.queue.counts.waiting"'
```

### Engine Observability

#### Log Analysis

```bash
# Count events by type
jq -r '.event' runs/observability/hooks.jsonl | \
  grep ^Engine | sort | uniq -c

# Job completion times
jq 'select(.event == "EngineJobCompleted") | .duration_ms' \
  runs/observability/hooks.jsonl | \
  awk '{sum+=$1; count++} END {print "Avg:", sum/count, "ms"}'

# Policy violations
jq 'select(.event == "EnginePolicyViolation")' \
  runs/observability/hooks.jsonl
```

#### Monitoring Dashboards

```bash
# Export metrics for Grafana/DataDog
node orchestration/cli.mjs engine emit-status | \
  curl -X POST https://monitoring.example.com/metrics \
    -H "Content-Type: application/json" \
    -d @-

# Continuous metric export
while true; do
  node orchestration/cli.mjs engine emit-status > \
    metrics/engine-$(date +%s).json
  sleep 60
done
```

### Emergency Procedures

#### Engine Unresponsive

```bash
# 1. Check Redis
redis-cli ping

# 2. Kill stuck workers
pkill -9 -f "engine start"

# 3. Clear job locks (CAUTION)
redis-cli --scan --pattern "bull:*:lock:*" | xargs redis-cli DEL

# 4. Restart clean
node orchestration/cli.mjs engine start
```

#### Queue Overflow

```bash
# Check queue size
redis-cli LLEN bull:swarm1:graphQueue:wait

# Pause processing
node orchestration/cli.mjs engine pause

# Clear low-priority jobs
# (Requires manual Redis operations)

# Resume with higher concurrency
ENGINE_CONCURRENCY=10 node orchestration/cli.mjs engine start
```

### Best Practices

1. **Monitor Redis memory** - Set maxmemory policy
2. **Use job priorities** - Critical jobs: 10, Normal: 5, Low: 1
3. **Set reasonable timeouts** - Default 5 min, extend for large graphs
4. **Regular backups** - Daily automated + before upgrades
5. **Tenant isolation** - Test thoroughly before production
6. **Health monitoring** - Alert on queue depth > 100
7. **Graceful shutdown** - Use SIGTERM, not SIGKILL

### Security Considerations

1. **Never commit bundles to git** - Use .gitignore for dist/
2. **Verify signatures** when implemented (Phase 9)
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
find dist/ -name "package.zip" -mtime +30 -delete

# Keep manifests and reports (bundles already removed above)
```
