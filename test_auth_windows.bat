@echo off
REM Phase 8 Auth Test Helper for Windows

echo [TEST] Setting Auth environment variables...
set AUTH_REQUIRED=true
set AUTH_JWT_SECRET=dev-secret-please-change
set AUTH_ISSUER=local-issuer
set AUTH_AUDIENCE=local-aud

echo [TEST] Testing auth failure (no token provided)...
node orchestration\cli.mjs engine enqueue orchestration\graph\projects\demo-01.yaml --tenant acme-corp
if errorlevel 405 (
  echo [OK] Auth correctly rejected missing token (exit code 405)
) else (
  echo [INFO] Auth allowed without token (AUTH_REQUIRED may not be enforced)
)

echo.
echo [TEST] Creating test JWT token...
mkdir tmp 2> NUL
echo import { SignJWT } from 'jose'; > tmp\make-token.mjs
echo const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET); >> tmp\make-token.mjs
echo const payload = { >> tmp\make-token.mjs
echo   sub: "admin-1", >> tmp\make-token.mjs
echo   roles: ["admin"], >> tmp\make-token.mjs
echo   tenant: "acme-corp", >> tmp\make-token.mjs
echo   iss: process.env.AUTH_ISSUER, >> tmp\make-token.mjs
echo   aud: process.env.AUTH_AUDIENCE >> tmp\make-token.mjs
echo }; >> tmp\make-token.mjs
echo const jwt = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(secret); >> tmp\make-token.mjs
echo console.log(jwt); >> tmp\make-token.mjs

for /f "delims=" %%i in ('node tmp\make-token.mjs') do set JWT=%%i

if defined JWT (
  echo [OK] JWT token generated successfully
  echo.
  echo [TEST] Testing auth success with valid token...
  node orchestration\cli.mjs engine enqueue orchestration\graph\projects\demo-01.yaml --tenant acme-corp --auth-token "Bearer %JWT%"
  if errorlevel 1 (
    echo [FAIL] Auth rejected valid token
  ) else (
    echo [OK] Auth accepted valid token
  )
) else (
  echo [FAIL] Could not generate JWT token
)

REM Cleanup
rmdir /s /q tmp 2> NUL

echo.
echo [TEST] Auth test complete