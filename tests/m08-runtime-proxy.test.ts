import assert from 'node:assert/strict'
import test from 'node:test'
import { runWorkspaceCommand } from '../agents/_workspace.ts'

class RuntimeLikeSandbox {
  #identity = 'runtime-sandbox'

  files = {
    makeDir: async () => {},
    exists: async () => true,
  }

  commands = {
    run: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
  }

  async kill(): Promise<void> {}

  async persist(): Promise<{ size: number; sha256: string; etag: string; persistedAt: string }> {
    assert.equal(this.#identity, 'runtime-sandbox', 'runtime method receiver must remain the original sandbox instance')
    return { size: 1, sha256: 'sha', etag: 'etag', persistedAt: 'now' }
  }
}

test('runner cancellation adapter preserves runtime sandbox method receivers', async () => {
  const controller = new AbortController()
  const result = await runWorkspaceCommand({
    sandbox: new RuntimeLikeSandbox(),
    request: { signal: controller.signal },
  }, 'conv-runtime-receiver', 'printf ok')

  assert.equal(result.exitCode, 0)
  assert.equal(result.persistence.persisted, true)
})
