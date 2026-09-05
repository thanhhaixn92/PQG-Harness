# PQG Harness Operations Runbook

## Operating principle

`main` is the canonical integration line. GitHub ruleset **Protect main is ACTIVE**: changes require a pull request, strict `quality`, resolved review threads, and cannot use deletion/non-fast-forward updates or bypass actors.

Production `/build-meta.json` is owner-verified as a **MATCH** for `main` commit `4918d54046fbe64bd11d28a72438180966ccd9d6`, tree `c6ec52df87a997aca49191053f09f01e497381b3`, package version `0.1.0`. Realtime approval without refresh and M08 Stop/cancellation are also live PASS.

Never convert an unavailable live verification into PASS based on unit/CI evidence alone. M01 isolated workspace recycle/recovery, environment scope, representative browser coverage, observability and rollback rehearsal remain separate live gates.

## 1. Source-side quality

Every change targeting `main` must pass the same gate enforced by `.github/workflows/quality.yml`:

```bash
npm ci
npm run prepare:dsh-web
git diff --exit-code -- index.html public agents/api
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Expected result: all commands succeed and preparation leaves committed generated artifacts unchanged. `npm run build:prepared` must emit `dist/build-meta.json` with exact 40-character Git commit/tree identities and the package version.

Use an implementation branch, open a PR to `main`, wait for strict `quality`, resolve review findings, and merge only the exact reviewed head. Do not bypass the ruleset.

## 2. Controlled Preview procedure

Use a non-Production EdgeOne Preview only when its identity can be distinguished from Production.

1. Select and record the exact candidate commit/tree.
2. Verify exact-head `quality` is GREEN.
3. Verify EdgeOne Console Production/Preview branch mapping and environment-variable scope without copying secret values.
4. Configure required Preview variables, including `PQG_ACCESS_SECRET`, recording presence/scope only.
5. Open the controlled Preview and verify `/build-meta.json` equals the candidate.
6. Run the relevant browser/model/SSE/workspace/approval/export smoke matrix.
7. Inspect native logs/metrics/traces without recording credentials.
8. Rehearse rollback/redeploy to a known-good commit and verify its build identity.

If a required step is unavailable, record BLOCKED. If it executes and fails, record FAIL.

## 3. Single-user access/auth verification

The source middleware is fail-closed and uses a minimum-32-character `PQG_ACCESS_SECRET`, POST login and a signed expiring hardened cookie. Direct environment configuration is still Console-owned evidence.

For a controlled candidate:

1. verify the secret is present in the intended environment without printing it;
2. verify anonymous browser navigation redirects to `/pqg-login`;
3. verify anonymous direct Agent/API access returns `PQG_AUTH_REQUIRED` before sidecar/model/tool work;
4. verify invalid login sets no session cookie;
5. verify valid login sets only the hardened signed session cookie;
6. verify authenticated UI/API flow;
7. verify tampered/expired cookies and logout behave correctly.

M03 remains BLOCKED until the live environment behavior/scope is recorded.

## 4. Workspace recovery verification — M01

M01 is the remaining Foundation live data-integrity gate.

For one isolated test conversation:

1. create, modify and delete known test files;
2. verify the mutation reports successful native checkpoint persistence;
3. force a fresh/recycled sandbox using the supported platform mechanism;
4. reopen the same conversation;
5. verify native restore returns the exact expected state;
6. confirm deleted files do not reappear and no persisted file disappears.

Until this exact-state recycle/restore proof is recorded, M01 stays BLOCKED.

## 5. Stop/cancellation regression — M08 CLOSED

**M08 is PASS / CLOSED.** The live test invoked Stop during a delayed workspace mutation, waited beyond the 60-second mutation point, and confirmed the expected artifact remained absent.

Re-run this scenario only as a regression check when changing cancellation, sidecar, MCP or workspace execution code. A regression must block promotion and reopen M08 before stronger cancellation behavior is considered.

## 6. Realtime approval regression

Realtime approval delivery is live PASS: the `Allow` prompt appears without browser refresh after the SSE downlink heartbeat fix.

When changing SSE/Host transport, verify:

1. an approval-requiring action is requested;
2. `Allow` appears without refresh;
3. execution starts only after approval;
4. Stop still cancels correctly.

## 7. Troubleshooting

### Access gate returns `PQG_ACCESS_NOT_CONFIGURED`

Verify only that `PQG_ACCESS_SECRET` is present in the correct environment and meets the minimum length. Do not print it. Redeploy/restart through the supported EdgeOne path after environment changes.

### Workspace restore fails

Do not persist a partial workspace. Capture only the non-secret restore reason. Legacy metadata migration is allowed only after native `not_found`.

### Workspace write succeeded but persistence failed

Treat the operation as non-durable. Do not report the change as safely saved until native persistence succeeds.

### Sidecar startup fails

The lifecycle layer retries startup with a bounded attempt count and cleans partially created child/Gateway/MCP resources. Inspect exception names and process state; do not dump environment values or prompt bodies.

### Gateway/model fails

Verify only required `AI_GATEWAY_*` presence/scope. Public responses should remain stable code-only errors.

## 8. Rollback

For repository-only changes, revert through a new protected PR and rerun the full quality gate.

For Preview, redeploy the previously known-good commit, verify `/build-meta.json`, then run minimal authenticated smoke.

For Production, stop further promotion first, use the supported rollback/redeploy mechanism to return to a previously verified build identity, and run only the safe authenticated Production smoke subset. The exact EdgeOne rollback mechanism still needs a controlled rehearsal before it can be considered a closed operational gate.

## 9. Credential incident

1. stop deployment/promotion;
2. rotate/revoke the affected credential at its owner;
3. search repository/PR/Actions/application evidence without reposting secret values;
4. remove public copies and rotate again if exposure scope is uncertain;
5. verify the replacement only in a controlled environment;
6. document the incident without secret values.

Rotating `PQG_ACCESS_SECRET` invalidates previously signed PQG sessions.

## 10. Upstream synchronization

Follow `UPSTREAM.md`; the local root snapshot and TencentEdgeOne upstream are unrelated Git histories. Use a dedicated `sync/upstream-*` branch and never combine a DSH compatibility-wave migration with unrelated product-module work.

## 11. Promotion decision

Protected `main` and source-side GREEN are necessary but not sufficient evidence for remaining live gates. Follow `docs/release/RELEASE_CHECKLIST.md`; currently M01, environment/access verification, browser coverage, observability, rollback rehearsal and Production/Preview topology details remain unresolved.

No business module or plugin work may be used as evidence that one of those infrastructure/release gates has passed.
