import { access, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const edgeoneDir = join(root, '.edgeone')
const agentNode = join(edgeoneDir, 'agent-node')

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function removeWithRetry(path) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      if (!await pathExists(path)) return
    } catch (error) {
      if (attempt === 7) {
        throw new Error(
          `Could not fully remove ${path}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        )
      }
    }
    await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)))
  }
  throw new Error(`Could not fully remove ${path}.`)
}

if (await pathExists(agentNode)) await removeWithRetry(agentNode)

if (await pathExists(edgeoneDir)) {
  for (const name of await readdir(edgeoneDir)) {
    if (name.startsWith('agent-node.stale-')) await removeWithRetry(join(edgeoneDir, name))
  }
}
