import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { runWithSandboxCancellationScope } from './_sandbox-abort.ts'
import {
  listWorkspace,
  publishWorkspacePreview,
  readWorkspaceFile,
  runWorkspaceCommand,
  workspaceRoot,
  writeWorkspaceFile,
} from './_workspace.ts'

export {
  ALL_MAKERS_TOOLS,
  DEFAULT_MAKERS_PERMISSION,
  isMakersPermissionMode,
  makersAskReason,
  makersAutoAllowTools,
  makersToolAllowed,
  makersToolGate,
} from './_makers-mcp-permission.mjs'

export interface McpRequestMetadata {
  method: string
  url: string
  bodyBytes: number
}

const MCP_REQUEST_LOG_LIMIT = 64
const MCP_CANCEL_TOMBSTONE_LIMIT = 128
const MCP_REQUEST_CANCELLED = -32800

export function appendMcpRequestMetadata(
  log: readonly McpRequestMetadata[],
  meta: McpRequestMetadata,
): McpRequestMetadata[] {
  return [...log, meta].slice(-MCP_REQUEST_LOG_LIMIT)
}

export interface LocalMcpBridge {
  url: string
  requestCount(): number
  requestLog(): McpRequestMetadata[]
  close(): Promise<void>
}

export type MakersContextProvider = () => any
export type MakersPermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access'

type McpHandlerExtra = { signal?: AbortSignal }
type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}
type McpToolHandler = (
  args: any,
  extra: McpHandlerExtra,
  context: any,
) => Promise<McpToolResult>

function toolName(tool: unknown): string {
  if (!tool || typeof tool !== 'object') return 'unknown'
  const record = tool as Record<string, unknown>
  if (typeof record.name === 'string') return record.name
  if (record.function && typeof record.function === 'object') {
    const name = (record.function as Record<string, unknown>).name
    if (typeof name === 'string') return name
  }
  return 'unknown'
}

function jsonRpcIdKey(value: unknown): string | undefined {
  if (typeof value === 'string') return `s:${value}`
  return typeof value === 'number' && Number.isFinite(value) ? `n:${String(value)}` : undefined
}

function mcpSessionId(request: IncomingMessage): string {
  const value = request.headers['mcp-session-id']
  return Array.isArray(value) ? String(value[0] || '') : String(value || '')
}

function scopedRequestKey(request: IncomingMessage, requestId: unknown): string | undefined {
  const id = jsonRpcIdKey(requestId)
  return id ? `${mcpSessionId(request)}\u0000${id}` : undefined
}

function jsonRpcRecord(body: unknown): Record<string, unknown> | undefined {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : undefined
}

function requestKey(request: IncomingMessage, body: unknown): string | undefined {
  const record = jsonRpcRecord(body)
  if (!record || typeof record.method !== 'string') return undefined
  return scopedRequestKey(request, record.id)
}

function cancellationTargetKey(request: IncomingMessage, body: unknown): string | undefined {
  const record = jsonRpcRecord(body)
  if (record?.method !== 'notifications/cancelled') return undefined
  const params = record.params && typeof record.params === 'object'
    ? record.params as Record<string, unknown>
    : undefined
  return scopedRequestKey(request, params?.requestId)
}

function rememberCancelledRequest(cancelled: Map<string, true>, key: string): void {
  cancelled.delete(key)
  cancelled.set(key, true)
  while (cancelled.size > MCP_CANCEL_TOMBSTONE_LIMIT) {
    const oldest = cancelled.keys().next().value as string | undefined
    if (oldest === undefined) break
    cancelled.delete(oldest)
  }
}

function rejectCancelledRequest(response: ServerResponse, body: unknown): void {
  const record = jsonRpcRecord(body)
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
  })
  response.end(JSON.stringify({
    jsonrpc: '2.0',
    id: record?.id ?? null,
    error: { code: MCP_REQUEST_CANCELLED, message: 'Request cancelled' },
  }))
}

async function createMcpServer(
  getContext: MakersContextProvider,
  conversationId: string,
): Promise<McpServer> {
  const server = new McpServer(
    { name: 'edgeone-makers-bridge', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  const register = (
    name: string,
    def: { description: string; inputSchema?: Record<string, unknown> },
    handler: McpToolHandler,
  ) => {
    server.registerTool(name, def as any, (args: any, extra: McpHandlerExtra) => {
      const context = getContext()
      return runWithSandboxCancellationScope(
        context,
        extra.signal,
        wrappedContext => handler(args, extra, wrappedContext),
      )
    })
  }

  register('makers_context_probe', {
    description: 'Report which EdgeOne Makers capabilities were injected into this run.',
    inputSchema: {},
  }, async (_args, _extra, context) => {
    const platformTools = typeof context.tools?.all === 'function'
      ? context.tools.all().map(toolName).filter((name: string) => name !== 'unknown')
      : []
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          conversationId,
          hasSandbox: Boolean(context.sandbox),
          hasStore: Boolean(context.store),
          platformToolCount: platformTools.length,
          platformTools: platformTools.slice(0, 16),
        }),
      }],
    }
  })

  register('sandbox_probe', {
    description: 'Execute a deterministic command in the EdgeOne Makers sandbox and return the result.',
    inputSchema: {},
  }, async (_args, _extra, context) => {
    const result = await context.sandbox.commands.run(
      "printf 'DSH_MAKERS_SANDBOX_OK'",
      { timeout: 10 },
    )
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: result.exitCode === 0 && result.stdout === 'DSH_MAKERS_SANDBOX_OK',
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        }),
      }],
      isError: result.exitCode !== 0,
    }
  })

  register('sandbox_wait', {
    description: 'Wait in the EdgeOne Makers sandbox. Used only to validate cancellation.',
    inputSchema: { seconds: z.number().int().min(1).max(30) },
  }, async ({ seconds }, _extra, context) => {
    try {
      const result = await context.sandbox.commands.run(
        `sleep ${String(seconds)}; printf 'WAIT_FINISHED'`,
        { timeout: seconds + 5 },
      )
      return {
        content: [{ type: 'text', text: result.stdout || result.stderr }],
        isError: result.exitCode !== 0,
      }
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
    }
  })

  register('workspace_list_files', {
    description: 'List the current coding workspace. Paths are relative to the workspace root.',
    inputSchema: {},
  }, async (_args, _extra, context) => {
    const listing = await listWorkspace(context, conversationId)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ root: workspaceRoot(conversationId), ...listing }),
      }],
    }
  })

  register('workspace_read_file', {
    description: 'Read one UTF-8 source file from the coding workspace using a relative path.',
    inputSchema: { path: z.string().min(1) },
  }, async ({ path }, _extra, context) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await readWorkspaceFile(context, conversationId, path)) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
    }
  })

  register('workspace_write_file', {
    description: 'Create or replace one complete UTF-8 source file in the coding workspace. Use one call per file. Read Only mode asks the user before this runs.',
    inputSchema: { path: z.string().min(1), content: z.string() },
  }, async ({ path, content }, _extra, context) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await writeWorkspaceFile(context, conversationId, path, content)) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
    }
  })

  register('workspace_run_command', {
    description: 'Run a shell command in the coding workspace. Use this for dependency installation, builds, tests, and diagnostics. Below Full access, the user is asked to confirm.',
    inputSchema: {
      command: z.string().min(1),
      timeout: z.number().int().min(1).max(300).optional(),
    },
  }, async ({ command, timeout }, _extra, context) => {
    try {
      const result = await runWorkspaceCommand(context, conversationId, command, timeout)
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: result.exitCode !== 0 || result.persistence.persisted !== true,
      }
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
    }
  })

  register('publish_preview', {
    description: 'Start the generated project and publish its preview. Call this after implementation and verification. Below Full access, the user is asked to confirm.',
    inputSchema: {},
  }, async (_args, _extra, context) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await publishWorkspacePreview(context, conversationId)) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
    }
  })

  return server
}

async function handleMcpRequest(
  transport: StreamableHTTPServerTransport,
  request: IncomingMessage,
  response: ServerResponse,
  parsedBody: unknown,
): Promise<void> {
  if (request.url !== '/mcp') {
    response.writeHead(404).end('not found')
    return
  }
  await transport.handleRequest(request, response, parsedBody)
}

export async function startLocalMcpBridge(
  getContext: MakersContextProvider,
  conversationId: string,
): Promise<LocalMcpBridge> {
  const server = await createMcpServer(getContext, conversationId)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })
  await server.connect(transport)

  let requests = 0
  let requestMetadata: McpRequestMetadata[] = []
  const activeRequestIds = new Set<string>()
  const cancelledBeforeRegistration = new Map<string, true>()
  const httpServer = createServer((request, response) => {
    requests += 1
    void (async () => {
      let parsedBody: unknown
      let bodyBytes = 0
      if (request.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(chunk as Buffer)
        const text = Buffer.concat(chunks).toString('utf8')
        bodyBytes = Buffer.byteLength(text)
        parsedBody = text ? JSON.parse(text) : undefined
      }
      requestMetadata = appendMcpRequestMetadata(requestMetadata, {
        method: request.method || 'UNKNOWN',
        url: request.url || '',
        bodyBytes,
      })

      const cancelledKey = cancellationTargetKey(request, parsedBody)
      if (cancelledKey && !activeRequestIds.has(cancelledKey)) {
        rememberCancelledRequest(cancelledBeforeRegistration, cancelledKey)
      }

      const currentRequestKey = requestKey(request, parsedBody)
      if (currentRequestKey && cancelledBeforeRegistration.delete(currentRequestKey)) {
        rejectCancelledRequest(response, parsedBody)
        return
      }

      if (currentRequestKey) activeRequestIds.add(currentRequestKey)
      try {
        await handleMcpRequest(transport, request, response, parsedBody)
      } finally {
        if (currentRequestKey) activeRequestIds.delete(currentRequestKey)
      }
    })().catch(error => {
      if (!response.headersSent) response.writeHead(500)
      response.end(error instanceof Error ? error.message : String(error))
    })
  })

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(0, '127.0.0.1', resolve)
    })
  } catch (error) {
    await server.close().catch(() => {})
    throw error
  }

  const address = httpServer.address()
  if (!address || typeof address === 'string') {
    await server.close().catch(() => {})
    throw new Error('MCP bridge did not receive a TCP address')
  }

  let closePromise: Promise<void> | undefined
  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      let mcpError: unknown
      try {
        await server.close()
      } catch (error) {
        mcpError = error
      }
      await new Promise<void>((resolve, reject) => {
        httpServer.close(error => error ? reject(error) : resolve())
        httpServer.closeAllConnections?.()
      })
      if (mcpError !== undefined) throw mcpError
    })()
    return closePromise
  }

  return {
    url: `http://127.0.0.1:${(address as AddressInfo).port}/mcp`,
    requestCount: () => requests,
    requestLog: () => requestMetadata.map(entry => ({ ...entry })),
    close,
  }
}
