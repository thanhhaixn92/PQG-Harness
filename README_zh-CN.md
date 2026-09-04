# DeepSeek Harness

一个跑在 EdgeOne Makers 上的全栈 Agent 模板：官方 DeepSeek Harness（`dsh web`）界面，Host API、AI Gateway、沙箱工具和会话隔离都接到 Makers 上。

**Framework：** DeepSeek Harness · **Category：** Coding · **Language：** TypeScript

[![部署到 EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/makers/new?template=deepseek-harness&from=within&fromAgent=1&agentLang=typescript)

## 概述

一个贴近生产形态的 TypeScript 模板，把官方 DeepSeek Harness 接到 EdgeOne Makers 上。浏览器直接加载发布版 DSH Web Shell 和 Cordis 客户端插件；Makers 负责静态托管、Agent 路由、AI Gateway、沙箱、Store 和 MCP 工具注入。方便你直接 fork，把精力放在官方 UI 里干活，而不是手写一套聊天壳。

- **官方 DSH Web** —— Sidebar、Workspace、Session、Chat、Trajectory、Tool 卡片、Goal、Plan、Subagent、Settings 和模型选择，均来自发布包 `@deepseek-ai/dsh-web-frontend`。
- **官方 DSH Host** —— 每个 Makers 会话启动独立的 `dsh web` sidecar，保留原生 Host API 和事件协议。
- **Makers Transport** —— `/api/*` RPC 转发到 sidecar；原生 WebSocket 下行转换成 Makers 可承载的 SSE。
- **Makers AI Gateway** —— sidecar 注册自定义 `edgeone-makers` 提供商并设为默认，经本机 Gateway adapter 转发到 `AI_GATEWAY_*`。官方 DeepSeek 提供商保持原样。
- **Makers MCP** —— DSH **Makers 模式** 只提供 `mcp__edgeone__*` 工具；文件、命令、浏览器和预览操作进入 `context.sandbox` / `context.tools`。
- **会话粘性隔离** —— 浏览器生成 `makers-conversation-id`；每个会话拥有独立 sidecar、`$DSH_HOME`、Workspace 和 MCP bridge。Settings YAML 会快照进 `context.store`。
- **双重取消** —— `POST /stop` 关闭对应 DSH Web sidecar，并调用 `context.utils.abortActiveRun()`。

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `AI_GATEWAY_API_KEY` | 是 | 模型网关 API Key。可填 Makers Models 的 API Key，也可以是任意 OpenAI 兼容服务商的 Key。 |
| `AI_GATEWAY_BASE_URL` | 是 | 网关 Base URL。Makers Models 请使用 `https://ai-gateway.edgeone.link/v1`。 |
| `AI_GATEWAY_MODEL` | 否 | 模型 ID。默认 `@makers/deepseek-v4-flash`（内置免费模型）。选择器列出全部 [内置模型](https://pages.edgeone.ai/zh/document/models-vendors-overview)。 |

模板遵循 OpenAI 兼容协议，可以指向 Makers Models，也可以指向任意 OpenAI 兼容的服务商。sidecar 经本机 adapter 访问 Gateway，不会把 Makers 流量打到 `api.deepseek.com`。

### 如何获取 `AI_GATEWAY_API_KEY`

1. 打开 [Makers 控制台](https://console.cloud.tencent.com/edgeone/makers)。
2. 登录并开通 Makers。
3. 进入 **Makers → Models → API Key**，新建一个 Key。
4. 把它粘到 `AI_GATEWAY_API_KEY`。

内置的 `@makers/deepseek-v4-flash` 免费但有用量限制，适合验证；生产建议自行绑定付费厂商（BYOK）。

### Provider fallbacks

sidecar 同时也会读取 `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`，并原样传给官方 DeepSeek 提供商。只有在模型选择器里还想保留官方提供商时才需要填。

## 本地开发

前置依赖：Node.js ≥ 22.19（DeepSeek Harness 要求 `^22.19 || >=24`），以及 EdgeOne CLI（`npm i -g edgeone`）。

```bash
npm install
cp .env.example .env       # 然后填入 AI_GATEWAY_API_KEY / AI_GATEWAY_BASE_URL
edgeone makers dev
```

本地 DSH Web：`http://localhost:8088/`。本地观测面板：`http://localhost:8088/agent-metrics`。

`npm run prepare:dsh-web` 会把官方 Web Shell 灌进 `public/`，并生成 `agents/api/` 下的 Host API 路由。升级 `@deepseek-ai/dsh-*` 包之后需要再跑一次。

## 项目结构

```text
deepseek-harness/
├── agents/                          # 有状态的 EdgeOne Makers Agent Functions（TypeScript）
│   ├── api/                        # DSH Host API 路由（生成的代理）
│   │   ├── _proxy.ts               # RPC 转发 + WebSocket → SSE 事件桥
│   │   ├── events.mux.ts           # GET /api/events.mux
│   │   ├── events.host.ts          # GET /api/events.host
│   │   └── ...                     # session / workspace / settings / ...
│   ├── stop.ts                     # POST /stop —— 中断 sidecar 与当前 agent
│   ├── _dsh-web-sidecar.ts         # 按会话启动 `dsh web` sidecar（私有）
│   ├── _gateway-proxy.ts           # 本机 AI Gateway adapter（私有）
│   ├── _mcp-bridge.ts              # mcp__edgeone__* → sandbox / tools（私有）
│   └── _workspace.ts               # 沙箱工作区辅助（私有）
├── public/                          # 官方 DSH Web Shell（生成物）
│   ├── index.html
│   └── plugins/                    # 官方 dsh.client bundle
├── scripts/
│   ├── prepare-dsh-web.mjs         # 灌入 DSH Web + SSE 补丁 + boot 图
│   ├── generate-dsh-api-routes.mjs # 生成 agents/api/*.ts 代理
│   └── ...                         # 生产裁剪 / 原生依赖还原
├── tests/
├── package.json
├── edgeone.json                     # EdgeOne 部署配置
├── .env.example                     # 环境变量模板
└── tsconfig.json
```

> 以 `_` 开头的文件是私有模块，不会暴露为公开路由。

## 资源

- [EdgeOne Makers Agents 文档](https://cloud.tencent.com/document/product/1552/132759)
- [EdgeOne Makers 快速开始](https://cloud.tencent.com/document/product/1552/132786)
- [Makers Models](https://cloud.tencent.com/document/product/1552/132748)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

## License

MIT.
