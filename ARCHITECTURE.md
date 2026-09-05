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

Generated `/api/*` routes proxy the DSH Host API to the conversation sidecar. Host event WebSockets are adapted into browser-facing SSE because Makers carries the event stream through HTTP responses. The SSE adapter keeps the live downlink active with a 5-second comment heartbeat and clears it on abort/error/close.

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

## Plugin-ready module boundary

PQG reuses the existing Cordis/DSH plugin lifecycle instead of introducing a second plugin framework. The root `package.json` dependency set is the installed-package source of truth; `config/modules.mjs` only recognizes direct dependencies that explicitly declare `pqg.module` metadata. Packages without that metadata remain ordinary dependencies and are invisible to the PQG module layer.

The minimal module declaration is intentionally small: stable module `id`, Vietnamese-facing `label`, `defaultEnabled`, and optional DSH client/Makers adapter exports. Future business plugins remain responsible for their own domain data and dashboards. PQG Core must never depend on any business plugin being present, and uninstalling a package must not implicitly delete its business data.

Runtime enable/disable, client contribution lifecycle, Agent capability exposure and durable module policy are separate follow-up layers. Cordis Loader/Fiber state and the MCP SDK remain the runtime authorities; PQG must not maintain a duplicate lifecycle truth.

No Task, Writing, Planning, Document, Data, Memory, Workflow or Skill business plugin is shipped by this substrate.

## Build identity and supply chain

`build:prepared` runs Vite and then writes `dist/build-meta.json` containing exact Git commit, Git tree, and package version. Invalid/unknown Git identities fail the build instead of emitting ambiguous deployment metadata.

Direct DSH dependencies are fixed to `0.1.0-rc.6`. `ws` is pinned to `8.21.3`. Exceptional native package restoration verifies package-lock SRI before destructive extraction.

Upstream provenance and vendor-patch synchronization are documented in `UPSTREAM.md`. The local repository and TencentEdgeOne upstream have unrelated Git roots, so ordinary ahead/behind/merge ancestry is not a valid synchronization model.

## Deployment boundary

EdgeOne Git integration is owner-reported reconnected. Production `/build-meta.json` is owner-verified at `main` commit `4918d54046fbe64bd11d28a72438180966ccd9d6`, tree `c6ec52df87a997aca49191053f09f01e497381b3`, package version `0.1.0`. Realtime approval delivery and M08 Stop/cancellation have also passed live Production checks.

The default branch is protected by the active `Protect main` repository ruleset: pull request required, strict `quality` status required, review-thread resolution required, deletion/non-fast-forward blocked, no bypass actors.

Production/Preview branch topology and environment-variable scope are still not independently available from the current execution environment. M01 isolated same-conversation persistence/recycle/restore proof remains pending. Therefore source-side GREEN and protected-branch mergeability must not be presented as proof of the remaining live data/environment gates.
