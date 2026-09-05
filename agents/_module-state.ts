import { discoverPqgModules } from '../config/modules.mjs'
import type { ModuleMcpBridge } from './_mcp-bridge.ts'
import {
  effectiveModuleEnabled,
  readModulePolicy,
  setModuleEnabled,
} from './_module-policy.ts'

export interface InstalledModuleState {
  id: string
  label: string
  enabled: boolean
}

export async function listInstalledModuleStates(
  context: any,
  rootDir = process.cwd(),
): Promise<InstalledModuleState[]> {
  const [modules, policy] = await Promise.all([
    discoverPqgModules(rootDir),
    readModulePolicy(context),
  ])
  return modules.map(module => ({
    id: module.id,
    label: module.label,
    enabled: effectiveModuleEnabled(module, policy),
  }))
}

export async function setInstalledModuleEnabled(
  context: any,
  moduleId: string,
  enabled: boolean,
  rootDir = process.cwd(),
): Promise<InstalledModuleState> {
  const id = moduleId.trim()
  const modules = await discoverPqgModules(rootDir)
  const module = modules.find(candidate => candidate.id === id)
  if (!module) throw new Error(`PQG module "${id}" is not installed`)
  const policy = await setModuleEnabled(context, id, enabled)
  return {
    id: module.id,
    label: module.label,
    enabled: effectiveModuleEnabled(module, policy),
  }
}

export async function applyModulePolicyToBridge(
  context: any,
  bridge: Pick<ModuleMcpBridge, 'setModuleEnabled'>,
  rootDir = process.cwd(),
): Promise<void> {
  const [modules, policy] = await Promise.all([
    discoverPqgModules(rootDir),
    readModulePolicy(context),
  ])
  for (const module of modules) {
    bridge.setModuleEnabled(module.id, effectiveModuleEnabled(module, policy))
  }
}
