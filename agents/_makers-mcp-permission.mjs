/** DSH plugin: keep every Makers MCP tool in the prompt, ask the user when the current mode does not auto-allow it. */
export const name = 'makers-mcp-permission'
export const inject = ['tools']

export const MCP_SERVER_NAME = 'edgeone'
export const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`
export const DEFAULT_MAKERS_PERMISSION = 'workspace-write'
export const SAFE_FALLBACK_MAKERS_PERMISSION = 'read-only'

export const ALL_MAKERS_TOOLS = Object.freeze([
  'makers_context_probe',
  'workspace_list_files',
  'workspace_read_file',
  'workspace_write_file',
  'workspace_run_command',
  'publish_preview',
  'sandbox_probe',
  'sandbox_wait',
])

const AUTO_ALLOW = Object.freeze({
  'read-only': Object.freeze(['makers_context_probe', 'workspace_list_files', 'workspace_read_file']),
  'workspace-write': Object.freeze([
    'makers_context_probe',
    'workspace_list_files',
    'workspace_read_file',
    'workspace_write_file',
  ]),
  'danger-full-access': ALL_MAKERS_TOOLS,
})

/** @param {unknown} value */
export function isMakersPermissionMode(value) {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access'
}

/** @param {unknown} value */
export function makersEffectivePermission(value) {
  return isMakersPermissionMode(value) ? value : SAFE_FALLBACK_MAKERS_PERMISSION
}

/** @param {unknown} mode */
export function makersAutoAllowTools(mode) {
  return AUTO_ALLOW[makersEffectivePermission(mode)]
}

export function makersToolAllowed(mode, tool) {
  return makersAutoAllowTools(mode).includes(tool)
}

export function makersRequiredMode(tool) {
  return tool === 'workspace_write_file' ? 'workspace-write' : 'danger-full-access'
}

export function makersRequiredModeLabel(tool) {
  return makersRequiredMode(tool) === 'workspace-write' ? 'Workspace Write' : 'Full access'
}

export function makersToolGate(mode, tool) {
  return makersToolAllowed(mode, tool) ? 'allow' : 'ask'
}

export function makersAskReason(mode, tool) {
  return `The ${tool} tool needs ${makersRequiredModeLabel(tool)} on EdgeOne Makers. Current permission is ${mode}. Allow this one call?`
}

export function makersRawToolName(publicName) {
  if (typeof publicName !== 'string' || !publicName.startsWith(MCP_TOOL_PREFIX)) return null
  return publicName.slice(MCP_TOOL_PREFIX.length)
}

export function apply(ctx) {
  ctx.on('tools/pre-execute', (exec, next) => {
    const tool = makersRawToolName(exec.name)
    if (!tool) return next()
    const sandboxPolicy = typeof ctx.get === 'function' ? ctx.get('sandboxPolicy') : ctx.sandboxPolicy
    let mode
    try {
      mode = sandboxPolicy?.resolve?.({ session: exec.agent?.session })?.mode
    } catch {
      mode = undefined
    }
    const current = makersEffectivePermission(mode)
    if (makersToolGate(current, tool) === 'allow') return next()
    return { kind: 'ask', reason: makersAskReason(current, tool) }
  })
}

export function makersMcpPermissionSource() {
  const declarations = [
    `export const name = ${JSON.stringify(name)}`,
    `export const inject = ${JSON.stringify(inject)}`,
    `export const MCP_SERVER_NAME = ${JSON.stringify(MCP_SERVER_NAME)}`,
    'export const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`',
    `export const DEFAULT_MAKERS_PERMISSION = ${JSON.stringify(DEFAULT_MAKERS_PERMISSION)}`,
    `export const SAFE_FALLBACK_MAKERS_PERMISSION = ${JSON.stringify(SAFE_FALLBACK_MAKERS_PERMISSION)}`,
    `export const ALL_MAKERS_TOOLS = Object.freeze(${JSON.stringify(ALL_MAKERS_TOOLS)})`,
    `const AUTO_ALLOW = Object.freeze(${JSON.stringify(AUTO_ALLOW)})`,
  ]
  const functions = [
    isMakersPermissionMode,
    makersEffectivePermission,
    makersAutoAllowTools,
    makersToolAllowed,
    makersRequiredMode,
    makersRequiredModeLabel,
    makersToolGate,
    makersAskReason,
    makersRawToolName,
    apply,
  ]
  return [
    ...declarations,
    ...functions.map(fn => `export ${fn.toString()}`),
    '',
  ].join('\n\n')
}
