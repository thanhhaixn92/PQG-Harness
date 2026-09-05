import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function hasExport(exportsField, key) {
  return Boolean(
    exportsField
    && typeof exportsField === 'object'
    && key in exportsField
    && exportsField[key] !== null,
  )
}

function moduleMetadata(pkg, packageName) {
  const metadata = pkg?.pqg?.module
  if (metadata === undefined) return undefined
  if (!metadata || typeof metadata !== 'object') {
    throw new Error(`${packageName}: pqg.module must be an object`)
  }
  if (typeof metadata.id !== 'string' || !metadata.id.trim()) {
    throw new Error(`${packageName}: pqg.module.id is required`)
  }
  if (typeof metadata.label !== 'string' || !metadata.label.trim()) {
    throw new Error(`${packageName}: pqg.module.label is required`)
  }
  if (typeof metadata.defaultEnabled !== 'boolean') {
    throw new Error(`${packageName}: pqg.module.defaultEnabled must be boolean`)
  }
  return metadata
}

export async function discoverPqgModules(rootDir = process.cwd()) {
  const rootPackage = await readJson(join(rootDir, 'package.json'))
  const optionalNames = new Set(Object.keys(rootPackage.optionalDependencies ?? {}))
  const dependencyNames = [...new Set([
    ...Object.keys(rootPackage.dependencies ?? {}),
    ...optionalNames,
  ])]
  const modules = []

  for (const packageName of dependencyNames) {
    let dependencyPackage
    try {
      dependencyPackage = await readJson(join(rootDir, 'node_modules', ...packageName.split('/'), 'package.json'))
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : ''
      if (optionalNames.has(packageName) && code === 'ENOENT') continue
      throw error
    }
    const metadata = moduleMetadata(dependencyPackage, packageName)
    if (!metadata) continue

    modules.push({
      id: metadata.id.trim(),
      label: metadata.label.trim(),
      packageName,
      defaultEnabled: metadata.defaultEnabled,
      client: Boolean(dependencyPackage?.dsh?.client) && hasExport(dependencyPackage.exports, './client'),
      makers: hasExport(dependencyPackage.exports, './makers'),
    })
  }

  return modules.sort((left, right) => left.id.localeCompare(right.id))
}
