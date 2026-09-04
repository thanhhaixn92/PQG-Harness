import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('agent config packages the DSH Web sidecar and allows long runs', async () => {
  const config = JSON.parse(await readFile(new URL('../edgeone.json', import.meta.url), 'utf8'))
  assert.equal(config.agents.timeout, 300)
  assert.ok(config.agents.externalNodeModules.includes('@deepseek-ai/dsh'))
  assert.ok(config.agents.externalNodeModules.every((name: string) => !name.includes('linux-x64')))
  assert.equal(config.agents.includeFiles, undefined)
})

test('production preparation preserves Linux runtime natives while restoring host build and runtime natives', async () => {
  const source = await readFile(
    new URL('../scripts/restore-host-frontend-natives.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /npm[\s\S]*pack/)
  assert.match(source, /@img\/sharp-linux-x64/)
  assert.match(source, /@img\/sharp-libvips-linux-x64/)
  assert.match(source, /@koromix\/koffi-linux-x64/)
  assert.match(source, /@koromix\/koffi-\$\{process\.platform\}-\$\{process\.arch\}/)
  assert.doesNotMatch(source, /spawnSync\(['"]npm['"], \[['"]install['"]/)
})

test('production pruning removes dependency source maps to stay below the Agent package limit', async () => {
  const source = await readFile(
    new URL('../scripts/prune-agent-dependencies.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /removeSourceMaps/)
  assert.match(source, /endsWith\('\.map'\)/)
})

test('sidecar config binds Makers Gateway and MCP bridges', async () => {
  const source = await readFile(new URL('../agents/_dsh-web-sidecar.ts', import.meta.url), 'utf8')
  assert.match(source, /startLocalGatewayProxy/)
  assert.match(source, /startLocalMcpBridge/)
  assert.match(source, /spawn\(process\.execPath, \[\s*'--expose-internals'/)
  assert.match(source, /Makers 模式/)
  assert.match(source, /workspace\.create/)
})

test('sidecar registers a custom Makers provider without hijacking DeepSeek', async () => {
  const source = await readFile(new URL('../agents/_dsh-web-sidecar.ts', import.meta.url), 'utf8')
  assert.match(source, /id: llm-pi-ai/)
  assert.match(source, /edgeone-makers/)
  assert.match(source, /displayName: EdgeOne Makers/)
  assert.match(source, /id: agent-default-model/)
  assert.match(source, /MAKERS_GATEWAY_API_KEY/)
  assert.match(source, /@makers\/hy3/)
  assert.match(source, /name: 'Hy-3'/)
  assert.match(source, /@makers\/hy3-preview/)
  assert.match(source, /name: 'Hy-3-Preview'/)
  assert.match(source, /@makers\/deepseek-v4-pro/)
  assert.match(source, /@makers\/deepseek-v4-flash/)
  assert.match(source, /@makers\/minimax-m3/)
  assert.match(source, /name: 'MiniMax-M3'/)
  assert.match(source, /@makers\/minimax-m2\.7/)
  assert.match(source, /name: 'MiniMax-M2\.7'/)
  assert.match(source, /@makers\/kimi-k2\.6/)
  assert.match(source, /name: 'Kimi-K2\.6'/)
  assert.match(source, /ensureMakersDefaultModelSettings/)
  assert.match(source, /id: permission/)
  assert.match(source, /Inspect the EdgeOne Makers sandbox/)
  assert.match(source, /makers-mcp-permission/)
  assert.match(source, /Every Makers tool stays available/)
  assert.match(source, /Commands and preview ask for confirmation/)
  assert.match(source, /workspace\.create/)
  assert.doesNotMatch(source, /DEEPSEEK_BASE_URL: gateway\.baseUrl/)
  assert.doesNotMatch(source, /DEEPSEEK_API_KEY: 'makers-proxy'/)
})

test('API proxy refuses selecting the four shipped agent presets', async () => {
  const source = await readFile(new URL('../agents/api/_proxy.ts', import.meta.url), 'utf8')
  assert.match(source, /LOCKED_BUILT_IN_PRESETS/)
  assert.match(source, /standard.*code.*minimal.*cordis/)
  assert.match(source, /agent-preset-read-only/)
})

test('API proxy buffers session.export as a binary stream so Makers does not UTF-8-decode the ZIP', async () => {
  const source = await readFile(new URL('../agents/api/_proxy.ts', import.meta.url), 'utf8')
  const exportBlock = source.slice(source.indexOf("path === '/api/session.export'"))
  assert.match(exportBlock, /upstream\.arrayBuffer\(\)/)
  assert.match(exportBlock, /x-content-type-stream/)
  assert.doesNotMatch(exportBlock.slice(0, 600), /headers\.set\('content-length'/)
  assert.match(source, /requestSearch/)
})
