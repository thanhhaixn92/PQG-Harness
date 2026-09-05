import assert from 'node:assert/strict'
import test from 'node:test'

const moduleRuntime = new URL('../agents/modules.ts', import.meta.url)

function fakeHandle() {
  const calls: string[] = []
  return {
    calls,
    handle: {
      enable() { calls.push('enable') },
      disable() { calls.push('disable') },
      remove() { calls.push('remove') },
    },
  }
}

test('module tool lifecycle reuses registered MCP handles for enable, disable, and remove', async () => {
  const { createModuleToolLifecycle } = await import(moduleRuntime.href)
  const lifecycle = createModuleToolLifecycle()
  const first = fakeHandle()
  const second = fakeHandle()

  lifecycle.setEnabled('task', false)
  lifecycle.add('task', first.handle)
  lifecycle.add('task', second.handle)
  assert.deepEqual(first.calls, ['disable'])
  assert.deepEqual(second.calls, ['disable'])

  lifecycle.setEnabled('task', true)
  assert.deepEqual(first.calls, ['disable', 'enable'])
  assert.deepEqual(second.calls, ['disable', 'enable'])

  lifecycle.remove('task')
  assert.deepEqual(first.calls, ['disable', 'enable', 'remove'])
  assert.deepEqual(second.calls, ['disable', 'enable', 'remove'])
})

test('unknown module lifecycle operations are safe and disabled by default', async () => {
  const { createModuleToolLifecycle } = await import(moduleRuntime.href)
  const lifecycle = createModuleToolLifecycle()

  lifecycle.remove('missing')
  assert.equal(lifecycle.isEnabled('missing'), false)
})
