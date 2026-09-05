export interface PqgModuleDefinition {
  id: string
  label: string
  packageName: string
  defaultEnabled: boolean
  client: boolean
  makers: boolean
}

export function discoverPqgModules(rootDir?: string): Promise<PqgModuleDefinition[]>
