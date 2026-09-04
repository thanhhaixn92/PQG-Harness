import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
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

export interface LocalMcpBridge {
  url: string
  requestCount(): number
  requestLog(): unknown[]
  close(): Promise<void>
}

export type MakersPermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access'

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

async function createMcpServer(context: any, conversationId: string): Promise<McpServer> {
  const server = new McpServer(
    { name: 'edgeone-makers-bridge', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  const register = (
    name: string,
    def: { description: string; inputSchema?: Record<string, unknown> },
    handler: (args: any) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>,
  ) => {
    server.registerTool(name, def as any, handler)
  }

  register('makers_context_probe', {
    description: 'Report which EdgeOne Makers capabilities were injected into this run.',
    inputSchema: {},
  }, async () => {
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
  }, async () => {
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
  }, async ({ seconds }) => {
    const result = await context.sandbox.commands.run(
      `sleep ${String(seconds)}; printf 'WAIT_FINISHED'`,
      { timeout: seconds + 5 },
    )
    return {
      content: [{ type: 'text', text: result.stdout || result.stderr }],
      isError: result.exitCode !== 0,
    }
  })

  register('workspace_list_files', {
    description: 'List the current coding workspace. Paths are relative to the workspace root.',
    inputSchema: {},
  }, async () => ({
    content: [{ type: 'text', text: JSON.stringify({ root: workspaceRoot(conversationId), items: await listWorkspace(context, conversationId) }) }],
  }))

  register('workspace_read_file', {
    description: 'Read one UTF-8 source file from the coding workspace using a relative path.',
    inputSchema: { path: z.string().min(1) },
  }, async ({ path }) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await readWorkspaceFile(context, conversationId, path)) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
    }
  })

  register('workspace_write_file', {
    description: 'Create or replace one complete UTF-8 source file in the coding workspace. Use one call per file. Read Only mode asks the user before this runs.',
    inputSchema: { path: z.string().min(1), content: z.string() },
  }, async ({ path, content }) => {
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
  }, async ({ command, timeout }) => {
    try {
      const result = await runWorkspaceCommand(context, conversationId, command, timeout)
      return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: result.exitCode !== 0 }
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
    }
  })

  register('publish_preview', {
    description: 'Start the generated project and publish its preview. Call this after implementation and verification. Below Full access, the user is asked to confirm.',
    inputSchema: {},
  }, async () => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await publishWorkspacePreview(context, conversationId)) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
    }
  })

  return server
}

async function handleMcpRequest(
  context: any,
  conversationId: string,
  request: IncomingMessage,
  response: ServerResponse,
  parsedBody: unknown,
): Promise<void> {
  if (request.url !== '/mcp') {
    response.writeHead(404).end('not found')
    return
  }
  const server = await createMcpServer(context, conversationId)
  const transport = new StreamableHTTPServerTransport({})
  response.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(request, response, parsedBody)
}

export async function startLocalMcpBridge(
  context: any,
  conversationId: string,
): Promise<LocalMcpBridge> {
  let requests = 0
  const requestBodies: unknown[] = []
  const httpServer = createServer((request, response) => {
    requests += 1
    void (async () => {
      let parsedBody: unknown
      if (request.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(chunk as Buffer)
        const text = Buffer.concat(chunks).toString('utf8')
        parsedBody = text ? JSON.parse(text) : undefined
        requestBodies.push(parsedBody)
      }
      await handleMcpRequest(context, conversationId, request, response, parsedBody)
    })().catch(error => {
      if (!response.headersSent) response.writeHead(500)
      response.end(error instanceof Error ? error.message : String(error))
    })
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(0, '127.0.0.1', resolve)
  })
  const address = httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('MCP bridge did not receive a TCP address')
  }

  return {
    url: `http://127.0.0.1:${(address as AddressInfo).port}/mcp`,
    requestCount: () => requests,
    requestLog: () => [...requestBodies],
    close: () => new Promise<void>((resolve, reject) => {
      httpServer.close(error => error ? reject(error) : resolve())
      httpServer.closeAllConnections?.()
    }),
  }
}
