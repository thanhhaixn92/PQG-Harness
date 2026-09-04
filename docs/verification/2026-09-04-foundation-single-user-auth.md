# Foundation Single-User Access Gate — 2026-09-04

## Trigger

After EdgeOne Git reconnect, an independent GitHub-hosted anonymous probe against the owner-supplied non-secret origin produced:

```text
GET /                -> 200
GET /build-meta.json -> 404
```

Probe workflow: `33898408637`.

The probe used no owner access token and did not call Agent, model, or tool APIs. This confirms that the current outer deployment does not block anonymous root access and that the canonical origin does not expose the Foundation `build-meta.json` identity marker.

Interpretation before remediation:

- Phase 1B M03 outer access boundary: **FAIL for anonymous root access**.
- Phase 1B M13 deployed Foundation identity: **NOT PARITY / unresolved**.
- The tokenized URL supplied by the owner is not stored in repository evidence.

## Source remediation

Foundation Core now includes a minimal Personal v1 application gate in root `middleware.ts`:

- matcher covers `/:path*`;
- `PQG_ACCESS_SECRET` is read only from EdgeOne middleware environment state;
- missing or shorter-than-32-character configuration fails closed with `PQG_ACCESS_NOT_CONFIGURED`;
- unauthenticated browser navigation redirects to `/pqg-login`;
- unauthenticated API/non-HTML requests receive `401 {"error":"PQG_AUTH_REQUIRED"}` before `context.next()`;
- login uses POST form data rather than query parameters;
- the configured access secret is never rendered into the login page or copied into the session cookie;
- successful login issues a seven-day HMAC-SHA256 signed `pqg_session` cookie with `HttpOnly`, `Secure`, `SameSite=Strict`, and `Path=/`;
- session signature, expiry, tampering, and future-expiry bounds are verified before pass-through;
- logout clears the session cookie;
- no database, public registration flow, multi-user RBAC, or third-party auth service is introduced.

`.env.example` documents only the variable name:

```text
PQG_ACCESS_SECRET=
```

Never record the real value in GitHub evidence.

## TDD / quality evidence

RED test-only candidate:

```text
commit: 463780373059306776dc1d29a21ff72f566aae7f
quality: 33898779107 — expected FAILURE
result: 99 tests / 90 pass / 9 auth tests fail because middleware.ts did not exist
```

Initial GREEN:

```text
commit: f43873243aae48bc0f8709b3ecdd362a18db9e53
quality: 33899050826 — SUCCESS
```

Review-follow-up regression candidate:

```text
commit: dcab811025aa5c1ba0aecc8c145af4a426cc5595
quality: 33899283052 — SUCCESS
```

The review-follow-up additionally proves the minimum secret length fails closed and a session is rejected after the seven-day validity window.

## Remaining live gate

Source-side mitigation does **not** by itself close M03. Before Foundation Freeze:

1. configure a randomly generated `PQG_ACCESS_SECRET` of at least 32 characters in the intended non-Production EdgeOne environment; record presence/scope only, never value;
2. deploy or identify the exact controlled Foundation candidate;
3. verify anonymous `GET /` no longer reaches the application shell and instead receives the expected login redirect;
4. verify anonymous direct Agent/API paths receive 401 before sidecar/model/tool work;
5. verify valid login creates the hardened session and permits the intended UI/API flow;
6. verify logout and expired/tampered sessions are rejected;
7. verify `/build-meta.json` through an authenticated session equals the exact candidate commit/tree.

Until these checks are attached, M03 remains **BLOCKED (source mitigation GREEN; live proof pending)** and M13 remains unresolved.
