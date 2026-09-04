const RUNNER_ABORT_WRAPPED = Symbol.for('pqg.runner-owned-sandbox-cancellation')

function workspaceAbortError(): Error {
  const error = new Error('WORKSPACE_COMMAND_ABORTED')
  error.name = 'AbortError'
  return error
}

function runtimeMember(target: any, property: PropertyKey): any {
  const value = Reflect.get(target, property, target)
  return typeof value === 'function' ? value.bind(target) : value
}

/**
 * Run one sandbox operation under the active EdgeOne runner's AbortSignal.
 * The runner owns the sandbox handle, so cancellation never depends on
 * process-local cross-request registries or the /stop request's sandbox.
 */
export async function runWithSandboxAbort<T>(
  context: any,
  operation: () => Promise<T>,
): Promise<T> {
  const signal = context?.request?.signal as AbortSignal | undefined
  if (!signal) return operation()

  let killPromise: Promise<void> | undefined
  const killOnce = (): Promise<void> => {
    killPromise ??= (async () => {
      if (typeof context?.sandbox?.kill !== 'function') return
      try {
        await context.sandbox.kill()
      } catch {
        console.warn('[workspace] runner sandbox kill failed')
      }
    })()
    return killPromise
  }

  if (signal.aborted) {
    void killOnce()
    throw workspaceAbortError()
  }

  let rejectAbort!: (error: Error) => void
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject
  })
  const onAbort = (): void => {
    // Cancellation settlement must not wait for sandbox.kill(). A slow kill
    // must never allow a concurrently settling command to win the race and
    // advance into checkpoint persistence. The kill still runs exactly once.
    void killOnce()
    rejectAbort(workspaceAbortError())
  }

  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([operation(), aborted])
  } catch (error) {
    if (signal.aborted) {
      void killOnce()
      throw workspaceAbortError()
    }
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Return a view of the current runner context whose sandbox command executor
 * is cancellation-aware. Only commands.run changes behavior. All other
 * runtime methods/getters retain the original EdgeOne object as their receiver
 * so class/private-field implementations are not broken by the adapter proxy.
 */
export function withRunnerOwnedSandboxCancellation(context: any): any {
  if (!context || context[RUNNER_ABORT_WRAPPED] === true) return context
  const sandbox = context.sandbox
  const commands = sandbox?.commands
  if (!sandbox || !commands || typeof commands.run !== 'function') return context

  const originalRun = commands.run.bind(commands)
  const wrappedCommands = new Proxy(commands, {
    get(target, property) {
      if (property === 'run') {
        return (...args: any[]) => runWithSandboxAbort(context, () => originalRun(...args))
      }
      return runtimeMember(target, property)
    },
  })
  const wrappedSandbox = new Proxy(sandbox, {
    get(target, property) {
      if (property === 'commands') return wrappedCommands
      return runtimeMember(target, property)
    },
  })

  return new Proxy(context, {
    get(target, property) {
      if (property === RUNNER_ABORT_WRAPPED) return true
      if (property === 'sandbox') return wrappedSandbox
      return runtimeMember(target, property)
    },
  })
}
