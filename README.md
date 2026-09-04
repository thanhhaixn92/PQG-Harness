# PQG Harness

PQG Harness is a single-owner Foundation Core built on the published DeepSeek Harness Web/Host runtime and EdgeOne Makers. It preserves the official DSH Web experience while adding the durability, permission, lifecycle, supply-chain, deployment-identity, product, and operational boundaries required before PQG business modules are introduced.

**Current scope:** Foundation Core WP0–WP7 for Personal v1. Task, Writing, Planning, Document, and Data modules are **not** part of this branch yet.

## Release status

WP0–WP7 source-side contracts are implemented and have GREEN evidence, but **Foundation Freeze is BLOCKED / not complete** until required live EdgeOne and repository-enforcement gates are closed or explicitly owner-accepted.

Current blockers include:

- EdgeOne access/auth policy — NOT VERIFIED;
- controlled Preview workspace recycle/recovery — BLOCKED;
- live Stop/command cancellation — BLOCKED;
- deployed `/build-meta.json` parity and Production/Preview topology — NOT VERIFIED/BLOCKED;
- environment scope, native observability, rollback rehearsal, representative browser smoke — BLOCKED;
- deployment-branch required-quality enforcement — confirmed absent on `main` (`protected:false`, required checks off, no rulesets).

EdgeOne Git integration is **RECONNECTED — OWNER-REPORTED on 2026-09-04**. Direct Console state, active Production branch mapping, and deployed commit parity remain NOT VERIFIED from this session. Because reconnect occurred before required-quality enforcement was configured, repository changes must not be treated as safe Production promotion evidence; do not merge/promote Foundation changes through `main` until the actual deployment branch and required `quality` gate are verified.

See [`PROJECT_STATUS.md`](PROJECT_STATUS.md), [`docs/release/RELEASE_CHECKLIST.md`](docs/release/RELEASE_CHECKLIST.md), [`docs/release/KNOWN_LIMITATIONS.md`](docs/release/KNOWN_LIMITATIONS.md), and [`docs/verification/2026-09-04-edgeone-reconnect-status.md`](docs/verification/2026-09-04-edgeone-reconnect-status.md).

## Architecture

```text
Browser — published DSH Web + PQG product layer
  |
  v
EdgeOne Makers Agent routes
  +--> per-conversation `dsh web` sidecar
  +--> loopback AI Gateway adapter
  +--> loopback MCP bridge
  +--> Makers context.store
  +--> Makers sandbox workspace
          `projects/<conversation>/workspace`
          native persist / restore
```

Key properties:

- **Official DSH Web/Host foundation** — the browser uses the published DSH Web shell and plugins; each Makers conversation owns a lifecycle-managed `dsh web` sidecar.
- **Conversation isolation** — browser requests carry `makers-conversation-id`; sidecar/home/workspace routing is conversation-scoped.
- **Makers transport** — Host API calls are proxied to the local sidecar; DSH WebSocket event downlinks are adapted to SSE.
- **Makers AI Gateway** — DSH model traffic uses the local `edgeone-makers` adapter and current Makers context.
- **Makers MCP** — reviewed `mcp__edgeone__*` tools bridge DSH to sandbox/files/commands/tools.
- **Native workspace durability** — Makers workspace state is checkpointed with native sandbox persist/restore. A mutation is not reported as durable when persist fails.
- **Fail-closed permissions** — invalid/missing policy resolves to read-only behavior; command/preview behavior follows the selected permission/approval boundary.
- **Lifecycle safety** — explicit sidecar state, bounded startup retry, idempotent cleanup, active leases, current-context refresh, SSE cancellation guards, and failure-independent Stop.
- **Build identity** — `build:prepared` emits `dist/build-meta.json` with exact Git commit/tree/package version.
- **PQG product layer** — product identity lives in `config/product.mjs`; generated frontend remains producer-owned.

Detailed architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `AI_GATEWAY_API_KEY` | Yes | Credential for the configured OpenAI-compatible/Makers Gateway. Never commit it. |
| `AI_GATEWAY_BASE_URL` | Yes | Gateway base URL. |
| `AI_GATEWAY_MODEL` | No | Default model identifier used when a request does not specify one. |

The required variable **presence and environment scope in EdgeOne Console are not currently verified**. Release evidence must record only status/scope, never values.

## Local development

Prerequisites: Node.js compatible with `package.json` (`^22.19 || >=24`) and the EdgeOne development tooling when running the Makers runtime locally.

```bash
npm ci
cp .env.example .env
npm run prepare:dsh-web
npm run typecheck
npm run test:prepared
npm run build:prepared
```

For the full local Makers environment, use the EdgeOne CLI/runtime appropriate to the project configuration.

### Generated frontend rule

Do **not** manually maintain root `index.html`, `public/`, or generated Host route files as independent sources.

The producer flow is:

```text
scripts/prepare-dsh-web.mjs
  -> scripts/apply-product-layer.mjs
  -> scripts/generate-dsh-api-routes.mjs
```

The quality workflow regenerates these artifacts and fails on drift.

## Project structure

```text
PQG-Harness/
├── agents/
│   ├── api/                    # generated Host API proxy routes
│   ├── _dsh-web-sidecar.ts     # per-conversation DSH lifecycle
│   ├── _gateway-proxy.ts       # loopback AI Gateway adapter
│   ├── _mcp-bridge.ts          # Makers MCP bridge
│   ├── _workspace.ts           # workspace durability / preview helpers
│   └── stop.ts                 # sidecar + platform abort
├── config/
│   └── product.mjs             # PQG identity source of truth
├── public/                     # generated DSH Web shell/plugins
├── scripts/                    # prepare, product, build identity, native integrity
├── tests/                      # Foundation contracts/regressions
├── docs/
│   ├── localization/
│   ├── release/
│   └── verification/
├── SECURITY.md
├── ARCHITECTURE.md
├── RUNBOOK.md
├── PROJECT_STATUS.md
├── UPSTREAM.md
└── CHANGELOG.md
```

## Foundation quality gate

A reviewed candidate should pass:

```bash
npm ci
npm run prepare:dsh-web
git diff --exit-code -- index.html public agents/api
npm run typecheck
npm run test:prepared
npm run build:prepared
```

CI success proves source/build contracts only. It does not replace controlled EdgeOne Preview/Production verification.

## Security and operations

- Security boundary and incident handling: [`SECURITY.md`](SECURITY.md)
- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Operating/recovery/rollback procedures: [`RUNBOOK.md`](RUNBOOK.md)
- Release decision matrix: [`docs/release/RELEASE_CHECKLIST.md`](docs/release/RELEASE_CHECKLIST.md)
- Known limitations: [`docs/release/KNOWN_LIMITATIONS.md`](docs/release/KNOWN_LIMITATIONS.md)
- Main guardrail verification: [`docs/verification/2026-09-04-main-guardrail.md`](docs/verification/2026-09-04-main-guardrail.md)
- EdgeOne reconnect status: [`docs/verification/2026-09-04-edgeone-reconnect-status.md`](docs/verification/2026-09-04-edgeone-reconnect-status.md)
- Vietnamese locale decision: [`docs/localization/vi-status.md`](docs/localization/vi-status.md)
- Upstream provenance/sync policy: [`UPSTREAM.md`](UPSTREAM.md)

## Upstream attribution

PQG Harness is the local product repository. It builds on:

- TencentEdgeOne `deepseek-harness` as the EdgeOne adapter/template lineage;
- DeepSeek `deepseek-harness` as the upstream DSH core ecosystem.

The local repository began from an unrelated-root snapshot, so ordinary Git ahead/behind ancestry against TencentEdgeOne is not meaningful. Follow `UPSTREAM.md` for synchronization.

## License

MIT. See the repository license and upstream attribution before redistribution.
