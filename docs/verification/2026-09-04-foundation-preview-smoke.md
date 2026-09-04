# Foundation Core Preview Smoke — 2026-09-04

## Scope and safety

This evidence originated during WP5 when Production Git Auto Deploy was owner-confirmed disconnected. The project owner later reported EdgeOne Git integration **RECONNECTED on 2026-09-04**. That operational change does not retroactively convert any BLOCKED live check into PASS.

The current session still does not have direct EdgeOne Console access or a reachable controlled non-Production Preview that can be independently identified and verified. Live cases that require them therefore remain **BLOCKED**, never inferred as PASS.

A tokenized EdgeOne access URL was later supplied by the owner. The credential/query parameters are intentionally not stored in repository evidence; the non-secret origin is recorded in `docs/verification/2026-09-04-edgeone-reconnect-status.md`. Fetch attempts from the current runtime still could not obtain application content.

## Source-side evidence

| Check | Status | Evidence |
|---|---|---|
| build-meta pure contract | PASS | Task 10 GREEN quality run `33887353859` |
| build pipeline invokes metadata writer after Vite | PASS | `build:prepared = vite build && node scripts/write-build-meta.mjs`; quality run `33887353859` |
| git commit/tree validation rejects unknown identities | PASS | `tests/build-meta.test.ts`; quality run `33887353859` |
| full prepared typecheck/tests/build | PASS | quality run `33887353859` |

## Controlled Preview smoke matrix

| Case | Status | Reason / required evidence |
|---|---|---|
| DNS / TLS / root | BLOCKED | owner-reported reconnect exists, but current execution environment cannot obtain a verified application response from the supplied origin |
| `/build-meta.json` equals deployed branch HEAD | BLOCKED | requires a reachable controlled Preview deployment with known candidate identity |
| main shell render | BLOCKED | requires controlled Preview |
| critical browser console errors | BLOCKED | requires browser against controlled Preview |
| model selector | BLOCKED | requires controlled Preview |
| permission selector/default | BLOCKED | requires controlled Preview |
| session creation | BLOCKED | requires controlled Preview |
| minimal model prompt (`Reply exactly: OK`) | BLOCKED | requires controlled Preview and configured model credentials |
| SSE progression | BLOCKED | requires controlled Preview |
| workspace list/read | BLOCKED | requires controlled Preview Agent runtime |
| harmless automatic write + durable checkpoint | BLOCKED | requires controlled Preview Agent runtime |
| refresh/reopen recovery | BLOCKED | requires controlled Preview Agent runtime |
| restricted command approval prompt | BLOCKED | requires controlled Preview |
| Stop | BLOCKED | requires controlled Preview |
| session export | BLOCKED | requires controlled Preview |
| phone/tablet/desktop shell usability | BLOCKED | requires controlled Preview browser |
| logged-out/incognito access behavior | BLOCKED | EdgeOne access/auth policy is not independently verified |

## Deployment topology and access gate

- EdgeOne Git connection: **RECONNECTED — OWNER-REPORTED on 2026-09-04; Console state not independently verified in this session**.
- Production/Preview branch mapping after reconnect: **NOT VERIFIED**.
- Environment variable scope: **NOT VERIFIED in EdgeOne Console**; no values were requested or recorded.
- Current deployment ID/source SHA: **NOT VERIFIED**.
- Access/auth protection state: **NOT VERIFIED — Foundation Freeze blocker**.
- GitHub `main` remains confirmed unprotected with required checks off; do not use a `main` merge/push as a safe promotion path until actual deployment mapping and required-quality enforcement are verified.

The official EdgeOne Makers authentication guidance warns that unauthenticated Agent APIs can be called directly and consume model/tool resources. Therefore absence of a verified outer access boundary cannot be treated as safe-by-default. Application authentication is not added speculatively: first verify the actual EdgeOne outer-access configuration; only if it is insufficient should a separate single-user authentication implementation be reviewed.

## Native observability

**BLOCKED.** EdgeOne native logs/metrics/traces cannot be inspected from this execution environment, so end-to-end correlation across browser → Host → DSH sidecar → Gateway/model → MCP → sandbox cannot be claimed.

No third-party telemetry was added because a missing critical observability boundary has not been demonstrated against a controlled Preview.

## Rollback rehearsal

**BLOCKED.** A supported, independently identified Preview deployment/rollback path is not available from the current execution environment. No Production rollback was attempted.

Required future proof:

1. deploy or identify Preview commit B;
2. verify `/build-meta.json == B`;
3. rollback/redeploy Preview commit A using the supported EdgeOne mechanism;
4. verify `/build-meta.json == A`;
5. run shell + minimal session/model smoke;
6. confirm environment scope remains correct.

## Release interpretation

WP5 source-side build identity is complete. WP5 live topology, auth, Preview smoke, native-observability and rollback gates remain **BLOCKED / NOT VERIFIED**. Owner-reported reconnect makes these checks actionable again but does not satisfy them by itself.
