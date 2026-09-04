import { registerActiveWorkspaceSandbox } from './_active-sandbox.ts'

const IGNORED_DIRECTORIES = new Set([
  '.git', '.next', '.cache', '.turbo', '.vite',
  'node_modules', 'dist', 'build', 'coverage', '__pycache__',
])

const IGNORED_FILES = new Set(['.DS_Store', 'preview'])

const SAFE_ENV_TEMPLATES = new Set(['.env.example', '.env.sample', '.env.template'])
const SENSITIVE_BASENAMES = new Set([
  '.env', '.npmrc', '.pypirc', '.netrc',
  'credentials', 'credentials.json', 'service-account.json',
])
const SENSITIVE_KEY_PREFIXES = ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519']
const SENSITIVE_KEY_EXTENSIONS = ['.key', '.pem', '.p12', '.pfx']

const TEXT_PREVIEW_LIMIT = 512 * 1024
const SNAPSHOT_FILE_LIMIT = 80
const WORKSPACE_READY_MARKER = '.pqg-workspace-ready'

interface WorkspaceSnapshotFile {
  content: string
  updatedAt: number
}

type WorkspaceSnapshot = Record<string, WorkspaceSnapshotFile>
type LegacySnapshotLoad =
  | { kind: 'found'; snapshot: WorkspaceSnapshot }
  | { kind: 'missing' }

export interface WorkspaceItem {
  path: string
  name: string
  type: 'file' | 'directory'
  depth: number
  size?: number
  mtime?: number
}

export interface WorkspaceListing {
  items: WorkspaceItem[]
  truncated: boolean
  limit: number
}

export interface WorkspaceCheckpoint {
  size: number
  sha256: string
  etag: string
  persistedAt: string
}

export interface WorkspacePersistenceStatus {
  persisted: boolean
  checkpoint?: WorkspaceCheckpoint
  error?: string
}

const workspacePersistQueues = new Map<string, Promise<WorkspaceCheckpoint>>()

export async function persistWorkspaceCheckpoint(
  context: any,
  conversationId: string,
  root: string,
): Promise<WorkspaceCheckpoint> {
  const previous = workspacePersistQueues.get(conversationId)
  const next = (previous ? previous.catch(() => undefined) : Promise.resolve())
    .then(() => context.sandbox.persist({ path: root, timeout: 180 }))
    .then((result: any) => ({
      size: Number(result.size),
      sha256: String(result.sha256 || ''),
      etag: String(result.etag || ''),
      persistedAt: String(result.persistedAt || ''),
    }))

  workspacePersistQueues.set(conversationId, next)
  try {
    return await next
  } finally {
    if (workspacePersistQueues.get(conversationId) === next) {
      workspacePersistQueues.delete(conversationId)
    }
  }
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'workspace'
}

export function workspaceRoot(conversationId: string): string {
  return `projects/${safeSegment(conversationId)}/workspace`
}

export function normalizeWorkspacePath(value: string): string | null {
  const path = value.trim().replaceAll('\\', '/').replace(/^\.\//, '')
  if (!path || path.startsWith('/') || path.includes('\0')) return null
  const parts = path.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) return null
  return parts.join('/')
}

export function isSensitiveWorkspacePath(requestedPath: string): boolean {
  const path = normalizeWorkspacePath(requestedPath)
  if (!path) return false
  const name = path.split('/').pop()!.toLowerCase()
  if (SAFE_ENV_TEMPLATES.has(name)) return false
  if (SENSITIVE_BASENAMES.has(name)) return true
  if (name.startsWith('.env.')) return true
  if (SENSITIVE_KEY_PREFIXES.some(prefix => name === prefix || name.startsWith(`${prefix}.`))) return true
  return SENSITIVE_KEY_EXTENSIONS.some(extension => name.endsWith(extension))
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
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
    content: 'workspace',
    metadata: { kind: 'workspace-bootstrap' },
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

async function loadLegacyWorkspaceSnapshot(
  context: any,
  conversationId: string,
): Promise<LegacySnapshotLoad> {
  if (!context?.store) return { kind: 'missing' }
  try {
    const conversation = await getConversation(context, conversationId)
    const snapshot = conversation?.metadata?.workspaceSnapshot
    if (!snapshot || typeof snapshot !== 'object' || Object.keys(snapshot).length === 0) {
      return { kind: 'missing' }
    }
    return { kind: 'found', snapshot: snapshot as WorkspaceSnapshot }
  } catch (error) {
    if (isMissingConversation(error)) return { kind: 'missing' }
    throw error
  }
}

async function workspaceReady(context: any, root: string): Promise<boolean> {
  return Boolean(await context.sandbox.files.exists(`${root}/${WORKSPACE_READY_MARKER}`))
}

async function markWorkspaceReady(context: any, root: string): Promise<void> {
  await context.sandbox.files.write(`${root}/${WORKSPACE_READY_MARKER}`, 'v1\n')
}

async function restoreLegacySnapshotFiles(
  context: any,
  root: string,
  snapshot: WorkspaceSnapshot,
): Promise<void> {
  for (const [path, file] of Object.entries(snapshot).slice(0, SNAPSHOT_FILE_LIMIT)) {
    const normalized = normalizeWorkspacePath(path)
    if (!normalized || typeof file?.content !== 'string') continue
    const parent = normalized.split('/').slice(0, -1).join('/')
    if (parent) await context.sandbox.files.makeDir(`${root}/${parent}`)
    await context.sandbox.files.write(`${root}/${normalized}`, file.content)
  }
}

async function initializeWorkspace(context: any, conversationId: string, root: string): Promise<void> {
  if (await workspaceReady(context, root)) return

  const restored = await context.sandbox.restore({ path: root, timeout: 180 })
  if (restored?.restored === true) {
    await markWorkspaceReady(context, root)
    return
  }
  if (restored?.reason !== 'not_found') {
    throw new Error(`Workspace restore failed: ${String(restored?.reason || 'unknown')}`)
  }

  const legacy = await loadLegacyWorkspaceSnapshot(context, conversationId)
  if (legacy.kind === 'found') {
    await restoreLegacySnapshotFiles(context, root, legacy.snapshot)
    await persistWorkspaceCheckpoint(context, conversationId, root)
    await updateConversationMetadata(context, conversationId, {
      workspaceSnapshot: {},
      workspaceSnapshotMigratedAt: Date.now(),
    })
    await markWorkspaceReady(context, root)
    return
  }

  await persistWorkspaceCheckpoint(context, conversationId, root)
  await markWorkspaceReady(context, root)
}

export async function ensureWorkspace(context: any, conversationId: string): Promise<string> {
  const root = workspaceRoot(conversationId)
  await context.sandbox.files.makeDir(root)
  await initializeWorkspace(context, conversationId, root)
  return root
}

export async function listWorkspace(context: any, conversationId: string): Promise<WorkspaceListing> {
  const root = await ensureWorkspace(context, conversationId)
  const ignored = [...IGNORED_DIRECTORIES]
    .map(directory => `-path './${directory}'`)
    .join(' -o ')
  const expression = `find . \\( ${ignored} \\) -prune -o -maxdepth 6`
  const result = await context.sandbox.commands.run([
    `{ ${expression} -printf '%y\\t%T@\\t%s\\t%p\\n' 2>/dev/null; }`,
    '||',
    `{ ${expression} -print | while IFS= read -r path; do`,
    `if [ -d "$path" ]; then printf 'd\\t0\\t0\\t%s\\n' "$path";`,
    `else printf 'f\\t0\\t0\\t%s\\n' "$path"; fi; done; }`,
  ].join(' '), { cwd: root, timeout: 30 })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to list workspace files.')
  }

  const parsed = String(result.stdout || '')
    .split('\n')
    .map((line: string) => line.trimEnd())
    .filter(Boolean)
    .map((line: string) => {
      const [kind = '', mtimeRaw = '', sizeRaw = '', ...pathParts] = line.split('\t')
      return { kind, mtimeRaw, sizeRaw, rawPath: pathParts.join('\t').replace(/^\.\//, '') }
    })
    .filter(item => item.rawPath && item.rawPath !== '.' && ['d', 'f', 'l'].includes(item.kind))
    .filter(item => !item.rawPath.split('/').some(segment => IGNORED_DIRECTORIES.has(segment)))
    .filter(item => !IGNORED_FILES.has(item.rawPath.split('/').pop() || ''))
    .filter(item => !isSensitiveWorkspacePath(item.rawPath))
    .map(item => {
      const name = item.rawPath.split('/').pop() || item.rawPath
      const mtime = Number.parseFloat(item.mtimeRaw)
      const size = Number.parseInt(item.sizeRaw, 10)
      return {
        path: item.rawPath,
        name,
        type: item.kind === 'd' ? 'directory' as const : 'file' as const,
        depth: item.rawPath.split('/').length - 1,
        ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
        ...(Number.isFinite(mtime) && mtime > 0 ? { mtime: Math.round(mtime * 1000) } : {}),
      }
    })

  const limit = 400
  return {
    items: parsed.slice(0, limit),
    truncated: parsed.length > limit,
    limit,
  }
}

export async function readWorkspaceFile(
  context: any,
  conversationId: string,
  requestedPath: string,
): Promise<{ path: string; content: string; size: number; truncated: boolean }> {
  const path = normalizeWorkspacePath(requestedPath)
  if (!path) throw new Error('Invalid workspace file path.')
  if (isSensitiveWorkspacePath(path)) {
    throw new Error('Sensitive workspace files are not available to automatic file tools.')
  }
  const root = await ensureWorkspace(context, conversationId)
  const result = await context.sandbox.files.read(`${root}/${path}`)
  const content = typeof result === 'string'
    ? result
    : result instanceof Uint8Array
      ? new TextDecoder().decode(result)
      : result instanceof ArrayBuffer
        ? new TextDecoder().decode(new Uint8Array(result))
        : typeof result?.content === 'string'
          ? result.content
          : ''
  const encoded = new TextEncoder().encode(content)
  const truncated = encoded.byteLength > TEXT_PREVIEW_LIMIT
  const visible = truncated
    ? new TextDecoder().decode(encoded.slice(0, TEXT_PREVIEW_LIMIT))
    : content
  return { path, content: visible, size: encoded.byteLength, truncated }
}

export async function writeWorkspaceFile(
  context: any,
  conversationId: string,
  requestedPath: string,
  content: string,
): Promise<{ path: string; bytes: number; persisted: true; checkpoint: WorkspaceCheckpoint }> {
  const path = normalizeWorkspacePath(requestedPath)
  if (!path) throw new Error('Invalid workspace file path.')
  if (isSensitiveWorkspacePath(path)) {
    throw new Error('Sensitive workspace files are not available to automatic file tools.')
  }
  const root = await ensureWorkspace(context, conversationId)
  const parent = path.split('/').slice(0, -1).join('/')
  if (parent) await context.sandbox.files.makeDir(`${root}/${parent}`)
  await context.sandbox.files.write(`${root}/${path}`, content)

  let checkpoint: WorkspaceCheckpoint
  try {
    checkpoint = await persistWorkspaceCheckpoint(context, conversationId, root)
  } catch (error) {
    throw new Error(`Workspace write completed but checkpoint persistence failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    path,
    bytes: new TextEncoder().encode(content).byteLength,
    persisted: true,
    checkpoint,
  }
}

export async function runWorkspaceCommand(
  context: any,
  conversationId: string,
  command: string,
  timeout = 120,
): Promise<{
  command: string
  stdout: string
  stderr: string
  exitCode: number
  persistence: WorkspacePersistenceStatus
}> {
  if (!command.trim()) throw new Error('Command must not be empty.')
  const root = await ensureWorkspace(context, conversationId)

  const releaseActiveSandbox = registerActiveWorkspaceSandbox(conversationId, context.sandbox)
  let result: any
  try {
    result = await context.sandbox.commands.run(command, {
      cwd: root,
      timeout: Math.min(Math.max(Math.round(timeout), 1), 300),
    })
  } finally {
    releaseActiveSandbox()
  }

  let persistence: WorkspacePersistenceStatus
  try {
    const checkpoint = await persistWorkspaceCheckpoint(context, conversationId, root)
    persistence = { persisted: true, checkpoint }
  } catch (error) {
    persistence = {
      persisted: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  return {
    command,
    stdout: String(result.stdout || '').slice(-20_000),
    stderr: String(result.stderr || '').slice(-20_000),
    exitCode: Number(result.exitCode),
    persistence,
  }
}

function normalizePublicUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function appendAccessToken(url: string, token: string): string {
  const parsed = new URL(url)
  parsed.pathname = '/preview/'
  parsed.search = ''
  parsed.searchParams.set('access_token', token)
  return parsed.toString()
}

export async function publishWorkspacePreview(
  context: any,
  conversationId: string,
): Promise<{ published: true; framework: string }> {
  const root = await ensureWorkspace(context, conversationId)
  const packageJsonExists = await context.sandbox.files.exists(`${root}/package.json`)
  const release = [
    'if command -v fuser >/dev/null 2>&1; then fuser -k 3000/tcp 2>/dev/null || true;',
    'elif command -v lsof >/dev/null 2>&1; then lsof -ti tcp:3000 | xargs -r kill -9 2>/dev/null || true; fi;',
    'sleep 1',
  ].join(' ')
  await context.sandbox.commands.run(release, { timeout: 10 })

  let framework = 'static'
  let command = "ln -sfn . preview; : > /tmp/dsh-preview.log; nohup python3 -m http.server 3000 --bind 0.0.0.0 >> /tmp/dsh-preview.log 2>&1 &"
  if (packageJsonExists) {
    const scripts = await context.sandbox.commands.run(
      "node -e \"const p=require('./package.json'); console.log(JSON.stringify(p.scripts||{}))\"",
      { cwd: root, timeout: 10 },
    )
    let parsed: Record<string, string> = {}
    try { parsed = JSON.parse(String(scripts.stdout || '{}')) } catch { parsed = {} }
    if (parsed.dev) {
      framework = 'node-dev'
      const host = normalizePublicUrl(context.sandbox.getHost(9000))
      const allowedHost = host ? new URL(host).hostname : ''
      command = [
        ': > /tmp/dsh-preview.log;',
        `nohup env PORT=3000 EDGEONE_PREVIEW_BASE_PATH=/preview __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=${shellQuote(allowedHost)}`,
        'npm run dev -- --host 0.0.0.0 --port 3000 >> /tmp/dsh-preview.log 2>&1 &',
      ].join(' ')
    } else if (parsed.start) {
      framework = 'node-start'
      command = ': > /tmp/dsh-preview.log; nohup env PORT=3000 npm run start >> /tmp/dsh-preview.log 2>&1 &'
    }
  }

  const started = await context.sandbox.commands.run(command, { cwd: root, timeout: 15 })
  if (started.exitCode !== 0) {
    throw new Error(started.stderr || started.stdout || 'Failed to start preview server.')
  }
  const ready = await context.sandbox.commands.run(
    "for i in $(seq 1 30); do curl -fsS http://127.0.0.1:3000/preview/ >/dev/null 2>&1 && exit 0; curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1 && exit 0; sleep 1; done; tail -80 /tmp/dsh-preview.log; exit 1",
    { timeout: 40 },
  )
  if (ready.exitCode !== 0) {
    throw new Error(ready.stdout || ready.stderr || 'Preview server did not become ready.')
  }

  try {
    await updateConversationMetadata(context, conversationId, {
      preview: { published: true, framework, updatedAt: Date.now() },
    })
  } catch (error) {
    console.warn('[workspace] preview metadata persistence failed:', error)
  }
  return { published: true, framework }
}

export async function currentPreview(
  context: any,
  conversationId: string,
): Promise<{ previewUrl?: string; published: boolean }> {
  try {
    const conversation = await getConversation(context, conversationId)
    const published = conversation?.metadata?.preview?.published === true
    if (!published) return { published: false }

    const health = await context.sandbox.commands.run(
      "curl -fsS http://127.0.0.1:3000/preview/ >/dev/null 2>&1 || curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1",
      { timeout: 5 },
    )
    if (health.exitCode !== 0) {
      try {
        await updateConversationMetadata(context, conversationId, {
          preview: { published: false, updatedAt: Date.now() },
        })
      } catch (error) {
        console.warn('[workspace] stale preview metadata cleanup failed:', error)
      }
      return { published: false }
    }

    try {
      const host = normalizePublicUrl(context.sandbox.getHost(9000))
      const token = String(context.sandbox.envdAccessToken || '')
      return { published: true, ...(host && token ? { previewUrl: appendAccessToken(host, token) } : {}) }
    } catch {
      return { published: true }
    }
  } catch {
    return { published: false }
  }
}
