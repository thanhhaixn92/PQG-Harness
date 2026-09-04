export const name: string
export const inject: readonly string[]
export const MCP_SERVER_NAME: string
export const MCP_TOOL_PREFIX: string
export const DEFAULT_MAKERS_PERMISSION: string
export const ALL_MAKERS_TOOLS: readonly string[]

export function isMakersPermissionMode(value: unknown): boolean
export function makersAutoAllowTools(mode: string): readonly string[]
export function makersToolAllowed(mode: string, tool: string): boolean
export function makersRequiredMode(tool: string): string
export function makersRequiredModeLabel(tool: string): string
export function makersToolGate(mode: string, tool: string): 'allow' | 'ask'
export function makersAskReason(mode: string, tool: string): string
export function makersRawToolName(publicName: unknown): string | null
export function apply(ctx: any): void
export function makersMcpPermissionSource(): string
