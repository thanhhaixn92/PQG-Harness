# PQG Harness Operations Runbook

## Operating principle

Treat `integration/foundation-core` as the current Foundation consolidation line. `main` remains the stable repository baseline until a controlled release decision is made.

EdgeOne Git integration is **RECONNECTED — OWNER-REPORTED on 2026-09-04**. Direct Console state, actual Production branch mapping, and deployed identity remain NOT VERIFIED from this session. Because reconnect occurred before required-quality enforcement was configured on `main`, routine source work must **not** merge/promote Foundation changes through `main` until the deployment branch and required `quality` gate are verified.

Never convert a blocked live verification into PASS based on unit/CI evidence alone.

## 1. Source-side quality

Before integrating a Foundation change, run the same gate enforced by `.github/workflows/quality.yml`:

```bash
npm ci
npm run prepare:dsh-web
git diff --exit-code -- index.html public agents/api
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Expected result: all commands succeed and generated artifacts are unchanged after preparation.

`npm run build:prepared` must also produce `dist/build-meta.json` with exact 40-character Git commit/tree identities and the package version.

Because the current quality workflow is triggered only for PRs targeting `main`, Foundation work may use a temporary verification PR targeting `main`. Such PRs are evidence-only and must be closed without merge; canonical implementation PRs target `integration/foundation-core`.

## 2. Controlled Preview release procedure

Use a non-Production EdgeOne Preview whose identity can be distinguished from Production.

1. Select the exact candidate commit from `integration/foundation-core` or a release branch.
2. Record candidate commit and tree.
3. Verify the quality workflow is GREEN on that exact candidate.
4. Verify EdgeOne Console Production/Preview branch mapping and environment-variable scope without copying secret values.
5. Configure required Preview variables, including a randomly generated `PQG_ACCESS_SECRET` of at least 32 characters; record presence/scope only, never values.
6. Create or identify the controlled non-Production Preview.
7. Verify anonymous root redirects to `/pqg-login` and anonymous direct API calls are rejected before application/runtime work.
8. Log in through POST and fetch `/build-meta.json`; verify commit/tree equal the candidate.
9. Run the smoke matrix in `docs/verification/2026-09-04-foundation-preview-smoke.md`.
10. Run the WP6 browser/viewport matrix in `docs/verification/2026-09-04-wp6-preview-ui.md`.
11. Inspect EdgeOne native logs/metrics/traces for a complete representative request without recording credentials.
12. Rehearse Preview rollback/redeploy and verify authenticated `/build-meta.json` returns to the expected previous commit.

If any required step is unavailable, record BLOCKED. If a step executes and fails, record FAIL. Do not continue promotion on a required FAIL.

Reconnect alone is not Preview evidence. See `docs/verification/2026-09-04-edgeone-reconnect-status.md`.

## 3. Single-user access/auth verification

A GitHub-hosted anonymous probe has already proved the currently reachable origin allows anonymous root access (`GET / = 200`). The source contingency is therefore no longer hypothetical: root `middleware.ts` implements the Personal v1 single-user gate.

In a controlled candidate:

1. configure a random `PQG_ACCESS_SECRET` of at least 32 characters in the intended EdgeOne environment; never place it in GitHub, URLs, logs, screenshots, or release evidence;
2. with no PQG session cookie, verify browser `GET /` returns a 303 login redirect rather than the application shell;
3. verify unauthenticated direct Agent/API requests return `401 {"error":"PQG_AUTH_REQUIRED"}` before sidecar/model/tool work;
4. verify `/pqg-login` renders no secret value and only submits with POST;
5. submit an invalid key and verify 401 + no session cookie;
6. submit the valid key and verify a `pqg_session` cookie with `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, seven-day max age, and no raw access secret;
7. verify authenticated UI/API flow works;
8. verify tampered/expired cookies are rejected;
9. verify `/pqg-logout` clears the session;
10. rotate the environment secret in Preview and verify prior sessions stop working.

M03 remains BLOCKED until this live evidence is recorded. Source evidence is in `docs/verification/2026-09-04-foundation-single-user-auth.md`.

## 4. Workspace recovery verification

For one test conversation in controlled authenticated Preview:

1. create a file using the automatic workspace write tool;
2. create/modify/delete additional files through a shell command;
3. verify the tool reports a successful native checkpoint;
4. recycle/recreate the sandbox using the supported platform mechanism;
5. reopen the same conversation;
6. verify native restore returns the expected exact workspace state;
7. verify files deleted before checkpoint do not reappear;
8. verify no operation reports durable success when checkpoint persistence fails.

The live recycle/recovery result remains BLOCKED until this procedure is executed.

## 5. Stop and cancellation verification

In controlled authenticated Preview:

1. start a command with an observable but harmless delayed side effect inside the test workspace;
2. invoke Stop while the command is running;
3. confirm the DSH sidecar stop and platform abort phases both return bounded status;
4. confirm the command does not continue mutating the workspace silently after Stop;
5. verify a subsequent sidecar acquire does not race the stopping instance;
6. repeat with an SSE/model run and confirm no late browser event socket opens after cancellation.

If the platform command continues despite `abortActiveRun`, document the exact behavior before considering any stronger sandbox termination mechanism.

## 6. Preview troubleshooting

### Access gate returns `PQG_ACCESS_NOT_CONFIGURED`

The gate is intentionally fail-closed. Verify only that `PQG_ACCESS_SECRET` is present in the correct Preview environment and is at least 32 characters. Do not print its value. After environment changes, redeploy/restart through the supported EdgeOne path before retesting.

### Valid key cannot establish a session

Check response status and cookie attributes without recording the key or cookie value. Confirm HTTPS is in use, the browser accepts `Secure`/`SameSite=Strict`, and middleware environment scope matches the candidate.

### Preview metadata says published but the site is unavailable

Preview metadata is not authoritative. The runtime checks current sandbox health. Re-publish/restart the preview process in the current sandbox; filesystem restore does not restore running processes.

### Workspace restore fails

Do not persist the partial workspace. Capture the non-secret restore reason. Check whether the live workspace marker exists and whether a native checkpoint is expected. Legacy metadata migration is allowed only after native `not_found`.

### Workspace write succeeded but persistence failed

Treat the operation as non-durable. Preserve the reported path/output for diagnosis, retry a native checkpoint when safe, and do not tell the user the change is safely saved until persist succeeds.

### Sidecar startup fails

The lifecycle layer retries startup up to the bounded attempt count and cleans partially created child/Gateway/MCP resources. Inspect exception names and process exit state; do not dump environment values or prompt bodies into issue evidence.

### Gateway/model fails

Verify only that required `AI_GATEWAY_*` variables are present and scoped to the intended environment. Do not copy their values. Public responses should remain stable code-only errors.

## 7. Rollback

### Repository-only rollback

If no deployment occurred, revert the offending change on its implementation/integration branch, run the full quality gate, and keep `main`/Production untouched.

### Preview rollback

Use the supported EdgeOne Preview deployment/redeploy mechanism to select previously known-good commit A after candidate B fails. Authenticate, verify `/build-meta.json == A`, then run root/session/minimal model smoke.

### Production rollback

Production rollback is not authorized by this runbook alone. Before promotion, record the actual EdgeOne rollback/redeploy mechanism during controlled Preview rehearsal. If a Production incident occurs, stop further Git promotion first, roll back to a previously verified build identity using the supported mechanism, and run only the safe authenticated Production smoke subset.

## 8. Credential incident

1. stop deployment/promotion;
2. rotate/revoke the affected credential or `PQG_ACCESS_SECRET` at its owner;
3. search repository/PR/Actions/application evidence for accidental copies without reposting the secret;
4. remove public copies and rotate again if exposure scope is uncertain;
5. verify the replacement only in controlled Preview;
6. document the incident without secret values.

Rotating `PQG_ACCESS_SECRET` invalidates previously signed PQG sessions.

See `SECURITY.md` for the security boundary.

## 9. Upstream synchronization

Follow `UPSTREAM.md` rather than normal Git merge ancestry. The local root snapshot and TencentEdgeOne upstream are unrelated histories.

Use a dedicated `sync/upstream-*` branch, compute/apply the vendor delta from the recorded Tencent baseline, and never combine an upstream/DSH package-wave migration with unrelated product-module work. Run quality + authenticated Preview smoke before integration.

## 10. Promotion decision

A source-side GREEN WP0–WP7 plus access mitigation is necessary but insufficient for Foundation Freeze. Promotion remains blocked while required live rows in `docs/release/RELEASE_CHECKLIST.md` are BLOCKED/NOT VERIFIED unless the owner explicitly accepts a listed risk with a dated reason.

Since EdgeOne Git integration is already reconnected, the required order is:

1. verify actual Production/Preview branch mapping and reconnect state;
2. configure required `quality` enforcement on the real deployment branch before any release merge/push;
3. configure and verify the single-user gate in controlled non-Production Preview;
4. verify authenticated `/build-meta.json` equals the exact candidate;
5. close durability, cancellation, runtime/UI smoke, observability and rollback gates;
6. only then approve a release merge/promotion;
7. verify deployed identity before safe authenticated Production smoke.

No product module development should be treated as release evidence for an unresolved Foundation gate.
