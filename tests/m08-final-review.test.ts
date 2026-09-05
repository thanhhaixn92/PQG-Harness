import assert from 'node:assert/strict'
import test from 'node:test'
import { withSandboxCancellation } from '../agents/_sandbox-abort.ts'
import { onRequestPost } from '../agents/stop.ts'

function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(promiseResolve => { resolve = promiseResolve })
  return { promise, resolve }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

test('cancellation terminates sandbox during file and restore mutations', async () => {
  for (const mutation of ['write', 'makeDir', 'restore'] as const) {
    const controller = new AbortController()
    const started = deferred()
    const release = deferred<any>()
    let sandboxKills = 0

    const context = {
      sandbox: {
        files: {
          write() {
            started.resolve(undefined)
            return release.promise
          },
          makeDir() {
            started.resolve(undefined)
            return release.promise
          },
        },
        commands: {
          async run() { return { stdout: '', stderr: '', exitCode: 0 } },
        },
        restore() {
          started.resolve(undefined)
          return release.promise
        },
        async kill() { sandboxKills += 1 },
      },
    }

    const sandbox = withSandboxCancellation(context, controller.signal).sandbox
    const operation = mutation === 'write'
      ? sandbox.files.write('projects/file.txt', 'data')
      : mutation === 'makeDir'
        ? sandbox.files.makeDir('projects/dir')
        : sandbox.restore({ path: 'projects/workspace' })

    await started.promise
    controller.abort(new Error('user stop'))

    const settled = await Promise.race([
      operation.then(() => true, () => true),
      wait(150).then(() => false),
    ])

    release.resolve(undefined)
    await operation.catch(() => {})

    assert.equal(settled, true, `${mutation} must reject promptly after cancellation`)
    assert.equal(sandboxKills, 1, `${mutation} cancellation must terminate the captured sandbox`)
  }
})

test('Stop converts a synchronous platform abort throw into a stable failure outcome', async () => {
  const response = await onRequestPost({
    request: { body: { conversation_id: 'conv-m08-sync-platform-abort' } },
    utils: {
      abortActiveRun() {
        throw new Error('sensitive synchronous platform failure')
      },
    },
  })
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(body.ok, false)
  assert.deepEqual(body.platform, {
    aborted: false,
    error: 'PLATFORM_ABORT_FAILED',
  })
  assert.equal(JSON.stringify(body).includes('sensitive synchronous platform failure'), false)
})
