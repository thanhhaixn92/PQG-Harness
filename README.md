# DeepSeek Harness

A full-stack EdgeOne Makers Agent template — the official DeepSeek Harness (`dsh web`) GUI, with Host API, AI Gateway, sandbox tools, and conversation isolation wired in on Makers.

**Framework:** DeepSeek Harness · **Category:** Coding · **Language:** TypeScript

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=deepseek-harness&from=within&fromAgent=1&agentLang=typescript)

## Overview

A production-shaped TypeScript starter that runs official DeepSeek Harness on EdgeOne Makers. The browser loads the published DSH Web Shell and Cordis client plugins; Makers hosts the static assets, Agent routes, AI Gateway, sandbox, store, and MCP tools — so you can fork it and start working in the official UI instead of plumbing a chat shell.

- **Official DSH Web** — Sidebar, Workspace, Session, Chat, Trajectory, Tool cards, Goal, Plan, Subagent, Settings, and model selection from the published `@deepseek-ai/dsh-web-frontend` package.
- **Official DSH Host** — each Makers conversation starts its own `dsh web` sidecar, keeping the native Host API and event protocol.
- **Makers transport** — `/api/*` RPC is forwarded to the sidecar; native WebSocket downlinks are converted to SSE that Makers can carry.
- **Makers AI Gateway** — the sidecar registers a custom `edgeone-makers` provider as default and forwards through a local Gateway adapter to `AI_GATEWAY_*`. The official DeepSeek provider is left unchanged.
- **Makers MCP** — DSH **Makers 模式** exposes only `mcp__edgeone__*` tools; file, command, browser, and preview work goes through `context.sandbox` / `context.tools`.
- **Sticky conversation isolation** — the browser generates `makers-conversation-id`; each conversation gets its own sidecar, `$DSH_HOME`, workspace, and MCP bridge. Settings YAML is snapshotted into `context.store`.
- **Dual cancellation** — `POST /stop` closes the matching DSH Web sidecar and calls `context.utils.abortActiveRun()`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes | Model gateway API key. Use your Makers Models API Key, or any OpenAI-compatible provider key. |
| `AI_GATEWAY_BASE_URL` | Yes | Gateway base URL. For Makers Models, use `https://ai-gateway.edgeone.link/v1`. |
| `AI_GATEWAY_MODEL` | No | Model ID. Defaults to `@makers/deepseek-v4-flash` (a free built-in model). The selector lists all [built-in models](https://pages.edgeone.ai/document/models-vendors-overview). |

This template follows the OpenAI-compatible standard — point these at Makers Models or any compatible provider. The sidecar talks to the Gateway through a local adapter; it does not send Makers traffic to `api.deepseek.com`.

### How to get `AI_GATEWAY_API_KEY`

1. Open the [Makers Console](https://edgeone.ai/makers/new?s_url=https://console.tencentcloud.com/edgeone/makers).
2. Sign in and enable Makers.
3. Go to **Makers → Models → API Key** and create a key.
4. Copy it into `AI_GATEWAY_API_KEY`.

The built-in `@makers/deepseek-v4-flash` model is free with a usage cap and is suitable for prototyping. For production, bind your own paid provider (BYOK).

### Provider fallbacks

The sidecar also reads `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` and passes them through to the official DeepSeek provider. Leave them unset unless you want that provider in the model picker alongside `edgeone-makers`.

## Local Development

Prerequisites: Node.js ≥ 22.19 (DeepSeek Harness requires `^22.19 || >=24`), and the EdgeOne CLI (`npm i -g edgeone`).

```bash
npm install
cp .env.example .env       # then fill in AI_GATEWAY_API_KEY / AI_GATEWAY_BASE_URL
edgeone makers dev
```

Local DSH Web is at `http://localhost:8088/`. Agent metrics & traces are exposed at `http://localhost:8088/agent-metrics`.

`npm run prepare:dsh-web` vendors the official Web Shell into `public/` and generates Host API routes under `agents/api/`. Run it after upgrading `@deepseek-ai/dsh-*` packages.

## Project Structure

```text
deepseek-harness/
├── agents/                          # Stateful EdgeOne Makers Agent Functions (TypeScript)
│   ├── api/                        # DSH Host API routes (generated proxies)
│   │   ├── _proxy.ts               # RPC forward + WebSocket → SSE event bridge
│   │   ├── events.mux.ts           # GET /api/events.mux
│   │   ├── events.host.ts          # GET /api/events.host
│   │   └── ...                     # session / workspace / settings / ...
│   ├── stop.ts                     # POST /stop — abort sidecar + active agent run
│   ├── _dsh-web-sidecar.ts         # Per-conversation `dsh web` sidecar (private)
│   ├── _gateway-proxy.ts           # Local AI Gateway adapter (private)
│   ├── _mcp-bridge.ts              # mcp__edgeone__* → sandbox / tools (private)
│   └── _workspace.ts               # Sandbox workspace helpers (private)
├── public/                          # Official DSH Web Shell (generated)
│   ├── index.html
│   └── plugins/                    # Official dsh.client bundles
├── scripts/
│   ├── prepare-dsh-web.mjs         # Vendor DSH Web + SSE patch + boot graph
│   ├── generate-dsh-api-routes.mjs # Emit agents/api/*.ts proxies
│   └── ...                         # Production prune / native restore
├── tests/
├── package.json
├── edgeone.json                     # EdgeOne deployment config
├── .env.example                     # Environment variables template
└── tsconfig.json
```

> Files prefixed with `_` are private modules — not exposed as public routes.

## Resources

- [EdgeOne Makers Agents — Documentation](https://pages.edgeone.ai/document/agents)
- [EdgeOne Makers — Quick Start](https://pages.edgeone.ai/document/agents-quick-start)
- [Makers Models](https://pages.edgeone.ai/document/models)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

## License

MIT.
