# Security Policy — PQG Harness

## Scope

This document describes the security boundary implemented by PQG Harness Foundation Core. It is a technical operating guide, not a claim that the currently reachable EdgeOne deployment is release-ready.

The repository is intended first for a single-owner Personal v1. Multi-user tenancy, RBAC, public signup, and enterprise compliance are outside the current Foundation Core scope.

## Current trust boundaries

### EdgeOne outer access and Personal v1 application gate

After EdgeOne Git reconnect, an independent GitHub-hosted anonymous probe against the canonical non-secret origin returned:

```text
GET /                -> 200
GET /build-meta.json -> 404
```

Workflow: `33898408637`.

Therefore the current outer deployment **does not provide the Personal v1 access boundary required by this project**, and it does not prove Foundation build identity. Do not treat a tokenized EdgeOne URL as equivalent to application authentication.

Foundation Core contains a minimal single-user middleware gate as the approved contingency:

- root `middleware.ts` matches `/:path*`;
- `PQG_ACCESS_SECRET` is read from middleware environment state and must be at least 32 characters;
- missing/short configuration fails closed before the application;
- unauthenticated browser navigation redirects to `/pqg-login`;
- unauthenticated API/non-HTML requests return stable 401 JSON before `context.next()`;
- login accepts the access key only through POST form data, never through the URL;
- the configured secret is never rendered into the page or stored in the session cookie;
- the session cookie contains an expiry plus HMAC-SHA256 signature and is `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, with a seven-day maximum lifetime;
- invalid, tampered, future-invalid, or expired sessions do not pass through;
- logout clears the cookie;
- there is no external identity database, registration flow, or multi-user RBAC.

Source-side tests are necessary but insufficient. M03 remains blocked until a controlled non-Production candidate has a randomly generated `PQG_ACCESS_SECRET` configured and live anonymous/direct-API/login/logout behavior is verified. See `docs/verification/2026-09-04-foundation-single-user-auth.md`.

### DSH/MCP permissions

Runtime permission resolution fails closed to `read-only` behavior when policy is missing, invalid, or throws. Makers tools remain visible; the permission layer decides whether a call can proceed automatically or must ask.

The presets are:

- `read-only`: automatic list/read; mutations, commands, and preview require escalation/approval behavior;
- `workspace-write`: automatic workspace file writes; commands and preview ask;
- `danger-full-access`: commands and preview may run without the lower-preset prompts. Treat this as explicit high privilege.

DSH tool approval remains a separate interaction boundary from sandbox permission. Do not weaken either boundary merely because the other exists.

### Sensitive workspace paths

Automatic workspace list/read/write paths reject or hide common secret-bearing names such as `.env*`, `.npmrc`, credentials files, service-account files, private-key prefixes, and common key/certificate extensions. Safe documentation templates such as `.env.example` remain visible.

This is a lexical path policy, not a complete canonical-filesystem sandbox. The current EdgeOne file API used here does not provide a verified `realpath`/`readlink` primitive, so symlink/canonical-path escape protection is **not claimed**. Full-access shell commands are also outside the automatic file-tool denylist.

### Preview credentials

Model/MCP-visible preview results do not contain tokenized sandbox preview URLs. Browser access is resolved through the project-owned same-origin preview route with no-store/no-referrer behavior. Do not copy redirected access tokens into logs, fixtures, issues, PRs, or release evidence.

### Gateway and Host errors

The local AI Gateway proxy forwards only the reviewed response-header allowlist (`content-type`, `cache-control`, `retry-after`, `x-request-id`). Public Gateway, Host proxy, and event-stream failures return stable error markers instead of raw exception text. Logs at these boundaries retain exception names rather than prompt bodies, API keys, workspace contents, or preview credentials.

The inherited `x-prompt-log` and `x-gateway-quota-bypass` request headers remain **NOT VERIFIED** from authoritative public documentation. Their semantics must not be inferred from their names.

## Durable data boundary

The Makers workspace at `projects/<safeConversationId>/workspace` is checkpointed with native sandbox `persist({ path })` and restored with native `restore({ path })`. Checkpoint operations are serialized per conversation.

A file mutation is not reported as durable success unless checkpoint persistence succeeds. Shell commands checkpoint their resulting workspace state even when the command exits non-zero because a failing command may already have modified files.

Legacy `conversation.metadata.workspaceSnapshot` data is migration input only. Native restore is authoritative; legacy migration runs only after native `not_found`, and legacy metadata is not cleared before successful native persist.

DSH settings YAML is separately snapshotted in `context.store` metadata. The DSH sidecar under `/tmp/dsh-makers-web/<conversation>` is process-local; do not treat process state as durable workspace state.

## Dependency and supply-chain boundary

Direct `@deepseek-ai/dsh*` dependencies are frozen to exactly `0.1.0-rc.6`. `ws` is pinned to `8.21.3`. Exceptional native tarballs restored by build tooling are verified against package-lock SRI before destination removal/extraction.

The reviewed dependency cleanup also keeps `fast-uri >= 3.1.7`, `qs >= 6.16.0`, and removes a redundant root OpenTelemetry wave while retaining DSH's own nested telemetry dependencies. The latest recorded npm audit result is point-in-time evidence only, not a permanent guarantee.

Do not mix a DSH package-wave upgrade with unrelated product changes. Upstream synchronization follows `UPSTREAM.md` and requires quality + controlled Preview verification before promotion.

## Credential handling

Never commit or paste into repository evidence:

- `PQG_ACCESS_SECRET`;
- `AI_GATEWAY_API_KEY` or provider keys;
- tokenized EdgeOne/preview URLs;
- `.env` contents;
- private keys/certificates;
- raw prompt or workspace content collected only for debugging.

Generate the Personal v1 access secret randomly and keep it at least 32 characters. Configure credentials through EdgeOne environment settings. Release evidence records only presence/scope/status, never values.

## Credential incident procedure

If a credential may have leaked:

1. stop further promotion/deployment activity;
2. revoke/rotate the affected key or access secret at its owning boundary;
3. invalidate or replace related deployment/preview access tokens when supported;
4. search repository history, Actions logs, issues/PRs, and application logs for accidental copies without reposting the secret;
5. remove public copies and rotate again if exposure scope is uncertain;
6. verify the replacement only in a controlled non-Production candidate;
7. record the outcome without recording secret values.

Rotating `PQG_ACCESS_SECRET` automatically invalidates previously signed PQG session cookies.

## Reporting a vulnerability

Do not place secrets, exploit credentials, or private user data in a public GitHub issue. Prefer a private security-reporting channel if enabled; otherwise contact the repository owner through a non-public channel with the minimum reproduction information required.

## Release security gate

Foundation source-side hardening can be GREEN while release security remains blocked. Before Foundation Freeze, the project must still verify:

- the single-user middleware on a controlled deployed candidate;
- anonymous root and direct Agent/API rejection before runtime work;
- authenticated deployed build SHA parity;
- environment-variable scope without exposing values;
- controlled Preview workspace recycle/recovery;
- live Stop/command-cancellation behavior;
- deployment-branch required-quality enforcement;
- safe Production smoke only after explicit promotion approval.

See `docs/release/RELEASE_CHECKLIST.md` and `docs/release/KNOWN_LIMITATIONS.md` for the authoritative release-state matrix.
