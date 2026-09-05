import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverPqgModules } from '../config/modules.mjs'
import type { ModuleMcpBridge } from './_mcp-bridge.ts'

type MakersAdapter = {
  apply(input: {
    moduleId: string
    bridge: Pick<ModuleMcpBridge, 'registerModuleTool'>
  }): void | Promise<void>
}

export async function applyInstalledMakersModules(
  _context: any,
  bridge: Pick<ModuleMcpBridge, 'registerModuleTool'>,
  rootDir = process.cwd(),
): Promise<void> {
  const modules = await discoverPqgModules(rootDir)
  const require = createRequire(join(rootDir, 'package.json'))

  for (const module of modules) {
    if (!module.makers) continue
    try {
      const entry = require.resolve(`${module.packageName}/makers`)
      const adapter = await import(pathToFileURL(entry).href) as MakersAdapter
      if (typeof adapter.apply !== 'function') continue
      await adapter.apply({ moduleId: module.id, bridge })
    } catch {}
  }
}
