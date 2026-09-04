import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { startLocalGatewayProxy, type LocalGatewayProxy } from './_gateway-proxy.ts'
import { makersMcpPermissionSource } from './_makers-mcp-permission.mjs'
import { startLocalMcpBridge, type LocalMcpBridge } from './_mcp-bridge.ts'

const require = createRequire(import.meta.url)

export interface DshWebSidecar {
  conversationId: string
  home: string
  port: number
  child: ChildProcess
  gateway: LocalGatewayProxy
  mcp: LocalMcpBridge
  lastUsedAt: number
  context: any
  close(): Promise<void>
}

const sidecars = new Map<string, Promise<DshWebSidecar>>()
const SIDECAR_IDLE_MS = 25 * 60_000
const DSH_SETTINGS_FILE = 'settings.yaml'
const DSH_SETTINGS_METADATA_KEY = 'dshSettingsYaml'
const DSH_SETTINGS_MAX_BYTES = 256 * 1024

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96) || 'default'
}

export function dshHomeFor(conversationId: string): string {
  return join('/tmp', 'dsh-makers-web', safeSegment(conversationId))
}

function isMissingConversation(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
  const message = error instanceof Error ? error.message : String(error)
  return code === 'MemoryNotFoundError' || /Conversation not found/i.test(message)
}

async function getConversation(context: any, conversationId: string): Promise<any> {
  try {
    return await context.store.getConversation({ conversationId })
  } catch (firstError) {
    try { return await context.store.getConversation(conversationId) } catch { throw firstError }
  }
}

async function appendBootstrapMessage(context: any, conversationId: string): Promise<void> {
  const payload = {
    conversationId,
    role: 'system' as const,
    content: 'dsh-settings',
    metadata: { kind: 'dsh-settings-bootstrap' },
  }
  try {
    await context.store.appendMessage(payload)
  } catch (firstError) {
    try {
      await context.store.appendMessage(conversationId, payload)
    } catch {
      throw firstError
    }
  }
}

async function ensureConversation(context: any, conversationId: string): Promise<void> {
  if (!context?.store) return
  try {
    await getConversation(context, conversationId)
  } catch (error) {
    if (!isMissingConversation(error)) throw error
    await appendBootstrapMessage(context, conversationId)
  }
}

async function updateConversationMetadata(
  context: any,
  conversationId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (!context?.store) return
  await ensureConversation(context, conversationId)
  try {
    await context.store.updateConversation({ conversationId, metadata })
    return
  } catch (firstError) {
    if (isMissingConversation(firstError)) {
      await appendBootstrapMessage(context, conversationId)
      await context.store.updateConversation({ conversationId, metadata })
      return
    }
    try {
      await context.store.updateConversation(conversationId, { metadata })
    } catch {
      throw firstError
    }
  }
}

export async function restoreDshSettingsYaml(
  context: any,
  conversationId: string,
  home: string,
): Promise<boolean> {
  if (!context?.store) return false
  try {
    const conversation = await getConversation(context, conversationId)
    const yaml = conversation?.metadata?.[DSH_SETTINGS_METADATA_KEY]
    if (typeof yaml !== 'string' || !yaml.trim()) return false
    if (new TextEncoder().encode(yaml).byteLength > DSH_SETTINGS_MAX_BYTES) return false
    await mkdir(home, { recursive: true })
    await writeFile(join(home, DSH_SETTINGS_FILE), yaml)
    return true
  } catch {
    return false
  }
}

export async function snapshotDshSettingsYaml(
  context: any,
  conversationId: string,
  home: string,
): Promise<boolean> {
  if (!context?.store) return false
  try {
    const yaml = await readFile(join(home, DSH_SETTINGS_FILE), 'utf8')
    if (!yaml.trim()) return false
    if (new TextEncoder().encode(yaml).byteLength > DSH_SETTINGS_MAX_BYTES) return false
    await updateConversationMetadata(context, conversationId, { [DSH_SETTINGS_METADATA_KEY]: yaml })
    return true
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : ''
    if (code === 'ENOENT') return false
    console.warn('[dsh-web] settings snapshot failed:', error)
    return false
  }
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = address && typeof address !== 'string' ? address.port : 0
  await new Promise<void>(resolve => server.close(() => resolve()))
  if (!port) throw new Error('Could not allocate a DSH Web sidecar port.')
  return port
}

const MAKERS_PROVIDER = 'edgeone-makers'
const MAKERS_GATEWAY_API_KEY_ENV = 'MAKERS_GATEWAY_API_KEY'
const DEFAULT_MAKERS_MODEL = '@makers/deepseek-v4-flash'
// Built-in Makers Models: https://pages.edgeone.ai/zh/document/models-vendors-overview
const MAKERS_MODELS = [
  { id: '@makers/hy3', name: 'Hy-3' },
  { id: '@makers/hy3-preview', name: 'Hy-3-Preview' },
  { id: '@makers/deepseek-v4-pro', name: 'DeepSeek-V4-Pro', reasoning: true },
  { id: '@makers/deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning: true },
  { id: '@makers/minimax-m3', name: 'MiniMax-M3' },
  { id: '@makers/minimax-m2.7', name: 'MiniMax-M2.7' },
  { id: '@makers/kimi-k2.6', name: 'Kimi-K2.6' },
] as const

type MakersModel = {
  id: string
  name: string
  reasoning?: boolean
}

function envString(context: any, key: string): string {
  const value = context?.env?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function makersDefaultModelSection(defaultModel: string): string {
  return [
    'agent-default-model:',
    `  provider: ${MAKERS_PROVIDER}`,
    `  model: ${JSON.stringify(defaultModel)}`,
    '',
  ].join('\n')
}

function settingsFieldOf(yaml: string, namespace: string, key: string): string | undefined {
  const block = yaml.match(new RegExp(`^${namespace}:\\n((?:[ \\t]+.*\\n)*)`, 'm'))?.[1] ?? ''
  const value = block.match(new RegExp(`^[ \\t]+${key}:\\s*(.*)$`, 'm'))?.[1]?.trim()
  if (!value) return undefined
  const quoted = value.match(/^(['"])(.*)\1$/)
  return quoted ? quoted[2] : value
}

function settingsProviderOf(yaml: string, namespace: string): string | undefined {
  return settingsFieldOf(yaml, namespace, 'provider')
}

/** Seed or migrate the Host default to the Makers catalog unless the user already picked a Makers model. */
export async function ensureMakersDefaultModelSettings(home: string, defaultModel: string): Promise<void> {
  const path = join(home, DSH_SETTINGS_FILE)
  let yaml = ''
  try {
    yaml = await readFile(path, 'utf8')
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : ''
    if (code !== 'ENOENT') throw error
  }
  if (settingsProviderOf(yaml, 'agent-default-model') === MAKERS_PROVIDER) return
  const section = makersDefaultModelSection(defaultModel)
  const next = yaml.trim()
    ? /^agent-default-model:/m.test(yaml)
      ? yaml.replace(/^agent-default-model:\n(?:[ \t]+.*\n)*/m, section)
      : `${yaml.replace(/\s*$/, '')}\n\n${section}`
    : section
  await mkdir(home, { recursive: true })
  await writeFile(path, next)
}

function makersModelCatalog(defaultModel: string): MakersModel[] {
  const catalog: MakersModel[] = MAKERS_MODELS.map(model => ({ ...model }))
  if (!catalog.some(model => model.id === defaultModel)) {
    catalog.unshift({ id: defaultModel, name: defaultModel })
  }
  return catalog
}

function modelYaml(models: MakersModel[]): string[] {
  return models.flatMap(model => [
    `          - id: ${JSON.stringify(model.id)}`,
    `            name: ${JSON.stringify(model.name)}`,
    '            contextWindow: 1000000',
    '            maxTokens: 256000',
    ...(model.reasoning ? [
      '            compat:',
      '              thinkingFormat: deepseek',
      '            reasoningEfforts:',
      "              'off':",
      '              high: high',
      '              max: max',
    ] : []),
  ])
}

async function writeProfilePatch(
  home: string,
  options: { mcpUrl: string; gatewayBaseUrl: string; defaultModel: string },
): Promise<void> {
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
  const presetRoot = join(home, '.agent-presets', 'makers')
  await mkdir(presetRoot, { recursive: true })
  await writeFile(join(presetRoot, 'preset.yml'), [
    'name: Makers 模式',
    'description: 使用 EdgeOne Makers MCP 工具、Sandbox 与 AI Gateway 的 DSH Agent。',
    'order: 1',
    '',
  ].join('\n'))
  await writeFile(
    join(presetRoot, 'makers-mcp-permission.mjs'),
    makersMcpPermissionSource(),
  )
  await writeFile(join(presetRoot, 'agent.cordis.yml'), [
    '- id: persona',
    "  name: '@deepseek-ai/dsh-persona'",
    '  config:',
    '    text: >-',
    '      You are a coding agent running on EdgeOne Makers. Use the mcp__edgeone__ tools for all file, command, and preview work. Never use local host filesystem or shell tools. Every Makers tool stays available. Permission modes only decide whether a call runs immediately or asks the user: Read Only auto-allows list and read; Workspace Write also auto-allows writes; Full access auto-allows commands and preview. If a tool needs a wider mode, call it normally — the user will be asked to approve. Inspect the workspace before editing, verify changes, and publish a preview when the project supports one.',
    '',
    '- id: makers-mcp-permission',
    '  name: ./makers-mcp-permission.mjs',
    '',
    '- id: tool-todo',
    "  name: '@deepseek-ai/dsh-tool-todo'",
    '  config:',
    '    allowParallelInProgress: false',
    '',
  ].join('\n'))
  await writeFile(join(home, 'cordis.patch.yml'), [
    '- id: agent-presets',
    '  config:',
    '    default: makers',
    '    includeUserRoot: true',
    '',
    '- id: permission',
    '  config:',
    '    defaultPreset: workspace-write',
    '    presets:',
    '      read-only:',
    '        sandbox: read-only',
    '        approval: ask',
    '        name: read-only',
        '        description: Inspect the EdgeOne Makers sandbox. Writes, commands, and preview ask for confirmation.',
        '      workspace-write:',
        '        sandbox: workspace-write',
        '        approval: ask',
        '        name: workspace-write',
        '        description: Read and write files in the EdgeOne Makers sandbox. Commands and preview ask for confirmation.',
    '      danger-full-access:',
    '        sandbox: danger-full-access',
    '        approval: never',
    '        name: danger-full-access',
    '        description: Full Makers sandbox access including commands and preview. The local machine is never accessible.',
    '',
    '- id: agent-default-model',
    '  config:',
    `    provider: ${MAKERS_PROVIDER}`,
    `    model: ${JSON.stringify(options.defaultModel)}`,
    '',
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
    `      ${MAKERS_PROVIDER}:`,
    '        displayName: EdgeOne Makers',
    `        apiKeyEnv: ${MAKERS_GATEWAY_API_KEY_ENV}`,
    '        api: openai-completions',
    `        baseURL: ${JSON.stringify(options.gatewayBaseUrl)}`,
    '        models:',
    ...modelYaml(makersModelCatalog(options.defaultModel)),
    '',
    '- insert:',
    '    - id: makers-mcp',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        transport: streamable-http',
    '        serverName: edgeone',
    `        url: ${JSON.stringify(options.mcpUrl)}`,
    '        headers: {}',
    '        toolCallTimeoutMs: 300000',
    '        failOnStartupError: true',
    '        reconnect:',
    '          enabled: true',
    '          initialDelayMs: 500',
    '          maxDelayMs: 5000',
    '          maxAttempts: 20',
    '',
  ].join('\n'))
}

async function callRpc(port: number, method: string, payload: Record<string, unknown>): Promise<void> {
  const deadline = Date.now() + 30_000
  let lastError: unknown
  while (Date.now() < deadline) {
    let response: Response
    try {
      response = await fetch(`http://127.0.0.1:${String(port)}/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload }),
      })
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 250))
      continue
    }
    if (response.ok) {
      const result = await response.json() as { result?: { ok?: boolean; error?: { message?: string } } }
      if (result.result?.ok === true) return
      throw new Error(result.result?.error?.message || `DSH sidecar ${method} failed`)
    }
    lastError = new Error(`DSH sidecar ${method} failed with HTTP ${String(response.status)}`)
    if (![404, 502, 503].includes(response.status)) throw lastError
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw lastError instanceof Error ? lastError : new Error(`DSH sidecar ${method} did not become ready`)
}

async function waitForReady(child: ChildProcess, port: number): Promise<void> {
  const deadline = Date.now() + 45_000
  let stderr = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', chunk => { stderr = `${stderr}${String(chunk)}`.slice(-8_000) })
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`DSH Web sidecar exited with ${String(child.exitCode)}: ${stderr}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/`, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
    } catch {
      // The server is still booting.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  child.kill('SIGTERM')
  throw new Error(`DSH Web sidecar did not become ready: ${stderr}`)
}

async function startSidecar(context: any, conversationId: string): Promise<DshWebSidecar> {
  const [port, gateway, mcp] = await Promise.all([
    freePort(),
    startLocalGatewayProxy(context, conversationId),
    startLocalMcpBridge(context, conversationId),
  ])
  const home = dshHomeFor(conversationId)
  const defaultModel = envString(context, 'AI_GATEWAY_MODEL') || DEFAULT_MAKERS_MODEL
  const deepseekApiKey = envString(context, 'DEEPSEEK_API_KEY')
  const deepseekBaseUrl = envString(context, 'DEEPSEEK_BASE_URL')
  await mkdir(home, { recursive: true })
  await restoreDshSettingsYaml(context, conversationId, home)
  await ensureMakersDefaultModelSettings(home, defaultModel)
  await writeProfilePatch(home, {
    mcpUrl: mcp.url,
    gatewayBaseUrl: gateway.baseUrl,
    defaultModel,
  })

  const dshBin = join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib', 'bin.js')
  const child = spawn(process.execPath, [
    '--expose-internals',
    dshBin,
    'web',
    '--host', '127.0.0.1',
    '--port', String(port),
  ], {
    cwd: home,
    env: {
      PATH: typeof context.env?.PATH === 'string' ? context.env.PATH : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOME: '/tmp',
      DSH_HOME: home,
      DSH_CWD: home,
      [MAKERS_GATEWAY_API_KEY_ENV]: 'makers-proxy',
      ...(deepseekApiKey ? { DEEPSEEK_API_KEY: deepseekApiKey } : {}),
      ...(deepseekBaseUrl ? { DEEPSEEK_BASE_URL: deepseekBaseUrl } : {}),
      DSH_TELEMETRY_DISABLED: '1',
      NO_COLOR: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    await waitForReady(child, port)
    const workspacePath = join(home, 'workspace')
    await mkdir(workspacePath, { recursive: true })
    await callRpc(port, 'workspace.create', { path: workspacePath })
  } catch (error) {
    await Promise.allSettled([gateway.close(), mcp.close()])
    throw error
  }

  const sidecar: DshWebSidecar = {
    conversationId,
    home,
    port,
    child,
    gateway,
    mcp,
    lastUsedAt: Date.now(),
    context,
    async close() {
      await snapshotDshSettingsYaml(sidecar.context, conversationId, home)
      child.kill('SIGTERM')
      await Promise.race([
        new Promise<void>(resolve => child.once('exit', () => resolve())),
        new Promise<void>(resolve => setTimeout(() => { child.kill('SIGKILL'); resolve() }, 3_000)),
      ])
      await Promise.allSettled([gateway.close(), mcp.close()])
    },
  }
  child.once('exit', () => {
    const current = sidecars.get(conversationId)
    if (current) void current.then(value => { if (value === sidecar) sidecars.delete(conversationId) })
  })
  return sidecar
}

function sweepIdleSidecars(): void {
  const cutoff = Date.now() - SIDECAR_IDLE_MS
  for (const [conversationId, pending] of sidecars) {
    void pending.then(sidecar => {
      if (sidecar.lastUsedAt >= cutoff) return
      if (sidecars.get(conversationId) === pending) sidecars.delete(conversationId)
      void sidecar.close()
    }).catch(() => { sidecars.delete(conversationId) })
  }
}

export async function getDshWebSidecar(context: any): Promise<DshWebSidecar> {
  const conversationId = String(context.conversation_id || '').trim()
  if (!conversationId) throw new Error('makers-conversation-id is required for DSH Web.')
  sweepIdleSidecars()
  let pending = sidecars.get(conversationId)
  if (!pending) {
    pending = startSidecar(context, conversationId)
    sidecars.set(conversationId, pending)
    void pending.catch(() => { if (sidecars.get(conversationId) === pending) sidecars.delete(conversationId) })
  }
  const sidecar = await pending
  sidecar.lastUsedAt = Date.now()
  sidecar.context = context
  return sidecar
}

export async function stopDshWebSidecar(conversationId: string): Promise<boolean> {
  const pending = sidecars.get(conversationId)
  if (!pending) return false
  sidecars.delete(conversationId)
  const sidecar = await pending
  await sidecar.close()
  return true
}
