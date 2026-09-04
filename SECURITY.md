# Security Policy — PQG Harness

## Scope

This document describes the security boundary currently implemented by PQG Harness Foundation Core. It is a technical operating guide, not a claim that the current public EdgeOne deployment is release-ready.

The repository is intended first for a single-owner Personal v1. Multi-user tenancy, RBAC, public signup, and enterprise compliance are outside the current Foundation Core scope.

## Current trust boundaries

### EdgeOne outer access

The access/authentication state of the deployed Agent endpoint is **NOT VERIFIED** in the EdgeOne Console and remains a Foundation Freeze blocker. Do not assume that a known deployment URL is private merely because it is not advertised.

Before any stable/public use, verify the outer access policy and direct Agent API behavior in an incognito/logged-out session. If the platform boundary is insufficient, add a separately reviewed single-user authentication gate before reconnecting Production Auto Deploy.

### DSH/MCP permissions

Runtime permission resolution fails closed to the `read-only` behavior when policy is missing, invalid, or throws. Makers tools remain visible; the permission layer decides whether a call can proceed automatically or must ask.

The current presets are:

- `read-only`: automatic list/read; mutations, commands, and preview require escalation/approval behavior.
- `workspace-write`: automatic workspace file writes; commands and preview ask.
- `danger-full-access`: commands and preview may run without the lower preset prompts. Treat this as explicit high privilege.

DSH tool approval remains a separate interaction boundary from sandbox permission. Do not weaken either boundary merely because the other one exists.

### Sensitive workspace paths

Automatic workspace list/read/write paths reject or hide common secret-bearing names such as `.env*`, `.npmrc`, credentials files, service-account files, private-key prefixes, and common key/certificate extensions. Safe documentation templates such as `.env.example` remain visible.

This is a lexical path policy, not a complete canonical-filesystem sandbox. The current EdgeOne file API used here does not provide a verified `realpath`/`readlink` primitive, so symlink/canonical-path escape protection is **not claimed**. Full-access shell commands are also not constrained by the automatic file-tool denylist.

### Preview credentials

Model/MCP-visible preview results do not contain tokenized sandbox preview URLs. Browser access is resolved through the project-owned same-origin preview route, which redirects with no-store/no-referrer behavior. Do not copy redirected access tokens into logs, test fixtures, issue comments, or release evidence.

### Gateway and Host errors

The local AI Gateway proxy forwards only the reviewed response-header allowlist (`content-type`, `cache-control`, `retry-after`, `x-request-id`). Public Gateway, Host proxy, and Host event-stream failures return stable error markers instead of raw exception text. Logs at these boundaries retain exception names rather than prompt bodies, API keys, workspace contents, or preview credentials.

The inherited `x-prompt-log` and `x-gateway-quota-bypass` request headers remain **NOT VERIFIED** from authoritative public documentation. Their semantics must not be inferred from their names.

## Durable data boundary

The Makers workspace at `projects/<safeConversationId>/workspace` is checkpointed with native sandbox `persist({ path })` and restored with native `restore({ path })`. Checkpoint operations are serialized per conversation.

A file mutation is not reported as durable success unless checkpoint persistence succeeds. Shell commands checkpoint their resulting workspace state even when the command exits non-zero, because a failing command may already have modified files.

Legacy `conversation.metadata.workspaceSnapshot` data is migration input only. Native restore is authoritative; legacy migration runs only after native `not_found`, and legacy metadata is not cleared before a successful native persist.

DSH settings YAML is separately snapshotted in `context.store` metadata. The DSH sidecar itself lives under `/tmp/dsh-makers-web/<conversation>` and is process-local; do not treat its process state as durable workspace state.

## Dependency and supply-chain boundary

Direct `@deepseek-ai/dsh*` dependencies are frozen to exactly `0.1.0-rc.6` for Foundation Core. `ws` is pinned to `8.21.3`. Exceptional native tarballs restored by the build tooling are verified against package-lock SRI before the destination package is removed/extracted.

Do not mix a DSH package-wave upgrade with unrelated product changes. Upstream synchronization follows `UPSTREAM.md` and must run the full quality + Preview gate before promotion.

## Credential handling

Never commit or paste into repository evidence:

- `AI_GATEWAY_API_KEY` or provider keys;
- tokenized preview URLs;
- `.env` contents;
- private keys/certificates;
- raw prompt or workspace content collected only for debugging.

Use environment configuration for credentials. Release evidence records only presence/scope/status, never values.

## Credential incident procedure

If a credential may have leaked:

1. stop promotion and keep Git Auto Deploy disconnected;
2. revoke/rotate the affected key in its owning provider/platform;
3. invalidate or replace any related deployment/preview access token when supported;
4. search repository history, Actions logs, issue/PR text, and application logs for the exposed material without reposting it;
5. remove public copies and rotate again if exposure scope is uncertain;
6. verify Gateway/model access with the replacement credential in a controlled Preview;
7. record the incident outcome without recording the secret itself.

## Reporting a vulnerability

Do not place secrets, exploit credentials, or private user data in a public GitHub issue. Prefer the repository's private security-reporting channel if enabled; otherwise contact the repository owner through a non-public channel and provide the minimum reproduction information required.

## Release security gate

Foundation source-side hardening can be GREEN while release security remains blocked. At minimum, a release candidate must still verify:

- EdgeOne access/auth behavior;
- controlled Preview workspace recycle/recovery;
- live Stop/command-cancellation behavior;
- deployed build SHA parity;
- environment scope;
- safe Production smoke after explicit promotion approval.

See `docs/release/RELEASE_CHECKLIST.md` and `docs/release/KNOWN_LIMITATIONS.md` for the authoritative release-state matrix.
