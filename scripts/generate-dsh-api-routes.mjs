import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const apiDir = fileURLToPath(new URL('../agents/api/', import.meta.url))
const methods = [
  'events.mux', 'events.host', 'respond', 'session.export',
  'session.list', 'session.search', 'session.create', 'session.history', 'session.models',
  'session.selectModel', 'session.rename', 'session.fork', 'session.prompt', 'session.attachment',
  'session.updateQueue', 'session.cancel',
  'subagent.list', 'subagent.history', 'subagent.prompt', 'subagent.interrupt',
  'host.describe', 'host.pickDirectory', 'host.listDirectory', 'host.createDirectory', 'host.openPath',
  'workspace.list', 'workspace.create', 'workspace.rename', 'workspace.delete',
  'workspace.insertBefore', 'workspace.insertSessionBefore', 'workspace.archiveSession',
  'skill.list',
  'agentPreset.list', 'agentPreset.select', 'agentPreset.read', 'agentPreset.copy',
  'agentPreset.openDocument', 'agentPreset.remove',
  'goal.create', 'goal.edit', 'goal.pause', 'goal.resume', 'goal.complete', 'goal.clear',
  'settings.describe', 'settings.openDocument', 'settings.update', 'settings.replace', 'settings.mutate',
  'credentials.describe', 'credentials.set', 'credentials.unset',
  'llm.providers', 'llm.models', 'llm.discoverModels',
  'commands/list', 'commands/execute',
  'goals/clear', 'goals/complete', 'goals/create', 'goals/edit', 'goals/pause', 'goals/resume',
  'pluginInventory/list',
  'messageFeedback/delete', 'messageFeedback/list', 'messageFeedback/put',
]

await mkdir(apiDir, { recursive: true })
for (const method of methods) {
  const target = `${apiDir}${method}.ts`
  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true })
  const proxyPath = method.includes('/') ? '../_proxy.ts' : './_proxy.ts'
  await writeFile(target, [
    `import { onRequest as proxyRequest } from ${JSON.stringify(proxyPath)}`,
    '',
    'export async function onRequest(context: any): Promise<Response> {',
    '  return proxyRequest(context)',
    '}',
    '',
  ].join('\n'))
}
console.log(`Generated ${String(methods.length)} DSH Web API routes.`)
