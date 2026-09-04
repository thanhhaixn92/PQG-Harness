# PQG Harness Architecture

## Purpose

PQG Harness is a productized EdgeOne Makers host for the published DeepSeek Harness Web UI and `dsh web` Host runtime. Foundation Core keeps the existing Makers + DSH architecture and hardens the boundaries required before business modules are introduced.

No business module (Task, Writing, Planning, Document, Data) is part of this Foundation Core.

## Runtime overview

```text
Browser
  |
  | static DSH Web + PQG product layer
  | /api/*, /rpc/*, SSE
  v
EdgeOne Makers Agent routes
  |
  +--> per-conversation DSH Web sidecar
  |      /tmp/dsh-makers-web/<conversation>/
  |      Host API + settings + process-local runtime
  |
  +--> loopback AI Gateway adapter
  |      -> EdgeOne/OpenAI-compatible upstream configured by AI_GATEWAY_*
  |
  +--> loopback MCP bridge
  |      -> Makers sandbox/files/commands/tools
  |
  +--> Makers context.store
  |      -> conversation metadata / DSH settings
  |
  +--> Makers sandbox
         projects/<safeConversationId>/workspace
         -> native persist/restore checkpoint
```

All local bridge servers bind to loopback. Browser traffic does not connect directly to those loopback services; Makers Agent routes mediate access.

## Browser and generated frontend

The browser uses the published DSH Web shell and client plugin graph. `scripts/prepare-dsh-web.mjs` vendors and patches the reviewed DSH frontend. `scripts/apply-product-layer.mjs` then applies PQG-owned product identity, browser-locale selection, local source/upstream attribution, and accessibility behavior. `scripts/generate-dsh-api-routes.mjs` emits the Host API route wrappers.

`index.html`, `public/`, and generated `agents/api/*` route files are generated artifacts. Their producers are the source of truth; the quality workflow runs preparation and fails if committed generated output drifts.

The Foundation product layer intentionally remains small. Full Vietnamese compilation is deferred because the pinned DSH `0.1.0-rc.6` runtime exposes per-namespace dictionary registration but retains a fixed selectable `zh/en` locale descriptor list. See `docs/localization/vi-status.md`.

## Conversation identity and isolation

The browser creates/persists a `makers-conversation-id` and attaches it to project API/RPC requests. The server sanitizes the value before deriving filesystem paths.

Each conversation has one lifecycle-managed DSH sidecar entry with explicit states:

```text
starting -> ready -> stopping
```

Concurrent acquires share one startup. Active leases protect in-use sidecars from idle reap. Startup retries are bounded. Cleanup is idempotent. Later requests refresh the sidecar's current Makers context instead of relying on the context captured at process creation.

The sidecar home is process-local under `/tmp/dsh-makers-web/<safeConversationId>`. Settings YAML may be restored/snapshotted through `context.store`; the sidecar process itself is not durable state.

## Host transport

Generated `/api/*` routes proxy the DSH Host API to the conversation sidecar. Host event WebSockets are adapted into browser-facing SSE because Makers carries the event stream through HTTP responses.

Unary/streaming requests hold a sidecar lease until the upstream response body reaches EOF, is cancelled, or errors. This prevents idle cleanup from killing a sidecar while a response is still streaming.

Stop is failure-independent: sidecar shutdown and `context.utils.abortActiveRun()` are attempted independently, and both outcomes are returned as bounded non-secret status. A sidecar that is still starting is marked stopping so a replacement cannot race the stop operation.

## AI Gateway boundary

The sidecar registers an `edgeone-makers` provider and sends model traffic to a loopback Gateway adapter. The adapter obtains the latest Makers context for each request and reads `AI_GATEWAY_*` configuration from that context.

Gateway response headers are reduced to an explicit allowlist. Public failures use stable error codes; raw provider/transport exception text is not serialized to the browser.

The inherited nonstandard request headers `x-prompt-log` and `x-gateway-quota-bypass` are preserved for compatibility but remain NOT VERIFIED. Their logging/quota semantics are not part of the trusted architecture contract.

## MCP and permission boundary

The loopback MCP bridge exposes the reviewed Makers tool set to DSH. Tool visibility is separated from permission decisions. The generated custom permission plugin resolves the current permission mode and returns allow/ask behavior; missing or invalid runtime policy fails closed to read-only semantics.

Automatic file operations apply the sensitive-path lexical denylist before I/O. Shell commands and preview follow their permission/approval semantics. `danger-full-access` remains a deliberately high-privilege mode.

DSH's approval path and the sandbox permission preset are complementary controls; neither should be treated as a replacement for the other.

## Workspace durability

The canonical Makers workspace used by project tools is:

```text
projects/<safeConversationId>/workspace
```

Initialization uses `.pqg-workspace-ready` as the live-sandbox marker. If the marker is absent:

1. native `context.sandbox.restore({ path })` is attempted;
2. a restored checkpoint wins;
3. only native `not_found` permits legacy metadata migration;
4. a new/migrated workspace is checkpointed before it is considered durable.

Native checkpoint writes are serialized per conversation. Direct file writes persist before reporting durable success. Shell commands persist after command completion even when the exit code is non-zero.

The old `conversation.metadata.workspaceSnapshot` is retained only as one-time migration input and is not the authoritative persistence mechanism.

Workspace listing returns `{ items, truncated, limit }` so callers can distinguish a complete listing from the 400-item envelope.

Preview publication metadata is not considered live by itself. Current preview state also requires a health check against the current sandbox process because native filesystem restore does not restart preview processes.

## Store usage

`context.store` is used for small conversation metadata required by the host integration, notably DSH settings YAML and legacy migration metadata. It is not used as a general document/database substitute for project workspace state.

Future Support Agent memory, once modules begin, must remain logically separate from project workspace data and use an explicit small/versioned schema. That future module-layer design is outside the current Foundation implementation.

## Build identity and supply chain

`build:prepared` runs Vite and then writes `dist/build-meta.json` containing exact Git commit, Git tree, and package version. Invalid/unknown Git identities fail the build instead of emitting ambiguous deployment metadata.

Direct DSH dependencies are fixed to `0.1.0-rc.6`. `ws` is pinned to `8.21.3`. Exceptional native package restoration verifies package-lock SRI before destructive extraction.

Upstream provenance and vendor-patch synchronization are documented in `UPSTREAM.md`. The local repository and TencentEdgeOne upstream have unrelated Git roots, so ordinary ahead/behind/merge ancestry is not a valid synchronization model.

## Deployment boundary

The repository currently records Git-connected EdgeOne Auto Deploy as DISCONNECTED by the owner. The current deployed commit, Production/Preview branch mapping, environment scope, access/auth policy, native observability, and rollback behavior are not independently verified from this execution environment.

Therefore `integration/foundation-core` is the consolidation branch for WP0-WP7. `main` is not promoted during Foundation implementation. A source-side GREEN Foundation is not equivalent to a completed Foundation Freeze; the live release gates in `docs/release/RELEASE_CHECKLIST.md` must be verified or explicitly owner-accepted first.
