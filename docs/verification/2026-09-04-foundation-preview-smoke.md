# Foundation Core Preview Smoke — 2026-09-04

## Scope and safety

This evidence is tied to the WP5 source branch and is intentionally conservative. Production Git Auto Deploy was owner-confirmed disconnected on 2026-09-04. No Production deployment was performed for this verification.

A controlled EdgeOne Preview deployment and EdgeOne Console access are not available from the current execution environment. Live cases that require them are therefore recorded as **BLOCKED**, never inferred as PASS.

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
| DNS / TLS / root | BLOCKED | controlled Preview domain not available |
| `/build-meta.json` equals deployed branch HEAD | BLOCKED | requires controlled Preview deployment |
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

- Git-connected EdgeOne deployment: **DISCONNECTED**, owner-confirmed 2026-09-04.
- Production/Preview branch mapping: **NOT VERIFIED for any future reconnect**.
- Environment variable scope: **NOT VERIFIED in EdgeOne Console**; no values were requested or recorded.
- Current deployment ID/source SHA: **NOT VERIFIED**.
- Access/auth protection state: **NOT VERIFIED — Foundation Freeze blocker**.

The official EdgeOne Makers authentication guidance warns that unauthenticated Agent APIs can be called directly and consume model/tool resources. Therefore absence of a verified outer access boundary cannot be treated as safe-by-default. Application authentication is not added speculatively: first verify the actual EdgeOne outer-access configuration; only if it is insufficient should a separate single-user authentication implementation be reviewed.

## Native observability

**BLOCKED.** EdgeOne native logs/metrics/traces cannot be inspected from this execution environment, so end-to-end correlation across browser → Host → DSH sidecar → Gateway/model → MCP → sandbox cannot be claimed.

No third-party telemetry was added because a missing critical observability boundary has not been demonstrated against a controlled Preview.

## Rollback rehearsal

**BLOCKED.** A supported Preview deployment/rollback path is not available from the current execution environment. No Production rollback was attempted.

Required future proof:

1. deploy Preview commit B;
2. verify `/build-meta.json == B`;
3. rollback/redeploy Preview commit A using the supported EdgeOne mechanism;
4. verify `/build-meta.json == A`;
5. run shell + minimal session/model smoke;
6. confirm environment scope remains correct.

## Release interpretation

WP5 source-side build identity is complete. WP5 live topology, auth, Preview smoke, native-observability and rollback gates remain **BLOCKED / NOT VERIFIED** and must not be represented as release-ready until controlled EdgeOne evidence exists.
