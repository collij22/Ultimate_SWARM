@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM =====================================================================
REM Phase 8 E2E validation script (Windows cmd)
REM - Starts Redis (Docker)
REM - Starts worker in background
REM - Runs unit + integration tests
REM - Exercises durable queue (enqueue/status)
REM - Emits and validates status schema
REM - Multi-tenant enqueue check
REM - Backup check
REM - Auth & RBAC (HMAC) positive/negative tests
REM - Cleans up worker and Redis container
REM =====================================================================

set "FAIL=0"
set "WORKER_TITLE=Swarm1Worker"
set "REDIS_CONTAINER=swarm1-redis"
set "TENANT1=acme-corp"
set "TENANT2=beta-inc"

echo [INFO] Starting Redis (Docker)...
docker run -d --rm --name %REDIS_CONTAINER% -p 6379:6379 redis:7-alpine 1> NUL 2> NUL
if errorlevel 1 (
  echo [WARN] Redis container may already be running. Continuing...
) else (
  echo [OK] Redis started.
)
echo.

echo [INFO] Installing dependencies (once)...
call npm i --no-fund --no-audit
if errorlevel 1 (
  echo [FAIL] npm install failed.
  set FAIL=1
  goto :cleanup
)
echo [OK] npm install complete.
echo.

echo [INFO] Installing browsers for Playwright (once)...
call npx playwright install
if errorlevel 1 (
  echo [FAIL] Playwright install failed.
  set FAIL=1
  goto :cleanup
)
echo [OK] Playwright browsers installed.
echo.

echo [INFO] Starting worker in a background window...
start "%WORKER_TITLE%" cmd /c node orchestration\cli.mjs engine start --tenant %TENANT1%
REM Give worker time to initialize
timeout /t 5 /nobreak > NUL
echo [OK] Worker started.
echo.

echo [STEP] Run unit tests...
call npm run test:unit
if errorlevel 1 (
  echo [FAIL] Unit tests failed.
  set FAIL=1
) else (
  echo [OK] Unit tests passed.
)
echo.

echo [STEP] Run integration tests...
call npm run test:integration
if errorlevel 1 (
  echo [FAIL] Integration tests failed.
  set FAIL=1
) else (
  echo [OK] Integration tests passed.
)
echo.

echo [STEP] Manual engine E2E sanity: enqueue demo graph (no auth)...
call node orchestration\cli.mjs engine enqueue orchestration\graph\projects\demo-01.yaml --tenant %TENANT1%
if errorlevel 1 (
  echo [FAIL] Enqueue failed (no auth mode).
  set FAIL=1
) else (
  echo [OK] Enqueued successfully.
)
echo.

echo [STEP] Queue status snapshot...
call node orchestration\cli.mjs engine status
if errorlevel 1 (
  echo [FAIL] Queue status failed.
  set FAIL=1
) else (
  echo [OK] Queue status OK.
)
echo.

echo [STEP] Emit status report and validate schema...
call node orchestration\cli.mjs engine emit-status > NUL
if errorlevel 1 (
  echo [FAIL] Emit status failed.
  set FAIL=1
) else (
  call node .\node_modules\ajv-cli\dist\index.js validate -s schemas\status.schema.json -d reports\status.json --verbose
  if errorlevel 1 (
    echo [FAIL] reports\status.json failed schema validation.
    set FAIL=1
  ) else (
    echo [OK] Status schema validation passed.
  )
)
echo.

echo [STEP] Multi-tenant isolation (enqueue two tenants)...
call node orchestration\cli.mjs engine enqueue orchestration\graph\projects\demo-01.yaml --tenant %TENANT1%
if errorlevel 1 (
  echo [FAIL] Enqueue for %TENANT1% failed.
  set FAIL=1
)
call node orchestration\cli.mjs engine enqueue orchestration\graph\projects\demo-01.yaml --tenant %TENANT2%
if errorlevel 1 (
  echo [FAIL] Enqueue for %TENANT2% failed.
  set FAIL=1
)

REM Informational checks for tenant-scoped output directories (do not hard fail)
if exist "runs\tenants\%TENANT1%" (
  echo [OK] Found tenant output: runs\tenants\%TENANT1%
) else (
  echo [INFO] Tenant path not found yet: runs\tenants\%TENANT1% (may appear after execution)
)
if exist "runs\tenants\%TENANT2%" (
  echo [OK] Found tenant output: runs\tenants\%TENANT2%
) else (
  echo [INFO] Tenant path not found yet: runs\tenants\%TENANT2% (may appear after execution)
)
echo.

echo [STEP] Backup checks...
call node orchestration\cli.mjs engine backup runs --tenant %TENANT1%
if errorlevel 1 (
  echo [FAIL] Backup (runs) failed.
  set FAIL=1
) else (
  echo [OK] Backup (runs) succeeded.
)
call node orchestration\cli.mjs engine backup both --tenant %TENANT1%
if errorlevel 1 (
  echo [FAIL] Backup (both) failed.
  set FAIL=1
) else (
  echo [OK] Backup (both) succeeded.
)
echo.

echo [STEP] AUTH & RBAC tests (HMAC local mode)...
set "AUTH_REQUIRED=true"
set "AUTH_JWT_SECRET=dev-secret-please-change"
set "AUTH_ISSUER=local-issuer"
set "AUTH_AUDIENCE=local-aud"

echo [INFO] Preparing token generator...
mkdir tmp 2> NUL
> tmp\make-token.mjs echo import { SignJWT } from 'jose';
>> tmp\make-token.mjs echo import fs from 'fs';
>> tmp\make-token.mjs echo const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
>> tmp\make-token.mjs echo const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET);
>> tmp\make-token.mjs echo const jwt = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(secret);
>> tmp\make-token.mjs echo console.log(jwt);

> tmp\admin.json echo {"sub":"admin-1","roles":["admin"],"tenant":"%TENANT1%","iss":"%AUTH_ISSUER%","aud":"%AUTH_AUDIENCE%"}
> tmp\dev.json   echo {"sub":"dev-1","roles":["developer"],"tenant":"%TENANT2%","iss":"%AUTH_ISSUER%","aud":"%AUTH_AUDIENCE%"}

for /f "usebackq delims=" %%i in (`node tmp\make-token.mjs tmp\admin.json`) do set "ADMIN_JWT=%%i"
for /f "usebackq delims=" %%i in (`node tmp\make-token.mjs tmp\dev.json`) do set "DEV_JWT=%%i"

if not defined ADMIN_JWT (
  echo [FAIL] Failed to generate ADMIN_JWT.
  set FAIL=1
)
if not defined DEV_JWT (
  echo [FAIL] Failed to generate DEV_JWT.
  set FAIL=1
)

echo [TEST] Enqueue with admin token (should succeed)...
call node orchestration\cli.mjs engine enqueue orchestration\graph\projects\demo-01.yaml --tenant %TENANT1% --auth-token "Bearer %ADMIN_JWT%"
if errorlevel 1 (
  echo [FAIL] Admin token enqueue failed unexpectedly.
  set FAIL=1
) else (
  echo [OK] Admin token enqueue succeeded.
)

echo [TEST] Enqueue with missing token (should fail with AUTH_REQUIRED=true)...
call node orchestration\cli.mjs engine enqueue orchestration\graph\projects\demo-01.yaml --tenant %TENANT1%
if errorlevel 1 (
  echo [OK] Missing token correctly rejected.
) else (
  echo [FAIL] Missing token was accepted unexpectedly.
  set FAIL=1
)

echo [TEST] Tenant mismatch: developer token for %TENANT2% enqueue to %TENANT1% (should fail)...
call node orchestration\cli.mjs engine enqueue orchestration\graph\projects\demo-01.yaml --tenant %TENANT1% --auth-token "Bearer %DEV_JWT%"
if errorlevel 1 (
  echo [OK] Tenant mismatch correctly rejected.
) else (
  echo [FAIL] Tenant mismatch was accepted unexpectedly.
  set FAIL=1
)

echo [TEST] Admin operations (status, pause, resume) with AUTH_TOKEN...
set "AUTH_TOKEN=Bearer %ADMIN_JWT%"
call node orchestration\engine\bullmq\admin.mjs status
if errorlevel 1 (
  echo [FAIL] Admin status failed.
  set FAIL=1
) else (
  echo [OK] Admin status OK.
)
call node orchestration\engine\bullmq\admin.mjs pause
if errorlevel 1 (
  echo [FAIL] Admin pause failed.
  set FAIL=1
) else (
  echo [OK] Queue paused.
)
call node orchestration\engine\bullmq\admin.mjs resume
if errorlevel 1 (
  echo [FAIL] Admin resume failed.
  set FAIL=1
) else (
  echo [OK] Queue resumed.
)
echo.

echo [STEP] Optional: full QA sweep (lint, typecheck, tests)...
call npm run qa
if errorlevel 1 (
  echo [FAIL] QA sweep failed.
  set FAIL=1
) else (
  echo [OK] QA sweep passed.
)
echo.

goto :cleanup

:cleanup
echo [INFO] Cleaning up worker and Redis...
REM Attempt to close the worker window
taskkill /f /fi "WINDOWTITLE eq %WORKER_TITLE%" 1> NUL 2> NUL

REM Stop Redis container
docker stop %REDIS_CONTAINER% 1> NUL 2> NUL

REM Remove temp files
rmdir /s /q tmp 2> NUL

echo.
if "%FAIL%"=="0" (
  echo ✅ Phase 8 E2E: ALL CHECKS PASSED
  exit /b 0
) else (
  echo ❌ Phase 8 E2E: FAILURES DETECTED
  exit /b 1
)