function workspaceAbortError(): Error {
  const error = new Error('WORKSPACE_COMMAND_ABORTED')
  error.name = 'AbortError'
  return error
}

function stableError(name: string, message: string): Error {
  const error = new Error(message)
  error.name = name
  return error
}

function runtimeMember(target: any, property: PropertyKey): any {
  const value = Reflect.get(target, property, target)
  return typeof value === 'function' ? value.bind(target) : value
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function terminateSandbox(sandbox: any): Promise<void> {
  if (typeof sandbox?.kill !== 'function') {
    throw stableError('SandboxTerminationError', 'SANDBOX_KILL_UNAVAILABLE')
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await sandbox.kill()
      return
    } catch {
      if (attempt === 0) await sleep(25)
    }
  }
  throw stableError('SandboxTerminationError', 'SANDBOX_KILL_FAILED')
}

async function runWithSandboxCancellation<T>(
  signal: AbortSignal | undefined,
  sandbox: any,
  operation: () => Promise<T>,
): Promise<T> {
  if (!signal) return operation()
  if (signal.aborted) throw workspaceAbortError()

  let started = false
  let cancelled = false
  let killPromise: Promise<void> | undefined
  const killOnce = (): Promise<void> => {
    killPromise ??= terminateSandbox(sandbox)
    return killPromise
  }

  let rejectAbort!: (error: Error) => void
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject
  })
  void abortPromise.catch(() => {})

  const onAbort = (): void => {
    if (cancelled) return
    cancelled = true
    if (!started) {
      rejectAbort(workspaceAbortError())
      return
    }
    void killOnce().then(
      () => rejectAbort(workspaceAbortError()),
      error => rejectAbort(error instanceof Error
        ? error
        : stableError('SandboxTerminationError', 'SANDBOX_KILL_FAILED')),
    )
  }

  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()

  try {
    if (cancelled) throw workspaceAbortError()
    started = true
    const result = await Promise.race([operation(), abortPromise])
    if (signal.aborted || cancelled) {
      await killOnce()
      throw workspaceAbortError()
    }
    return result
  } catch (error) {
    if (signal.aborted || cancelled) {
      if (started) {
        try {
          await killOnce()
        } catch (killError) {
          throw killError
        }
      }
      if (error instanceof Error && error.name === 'SandboxTerminationError') throw error
      throw workspaceAbortError()
    }
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export function withSandboxCancellation(context: any, signal?: AbortSignal): any {
  if (!signal) return context
  const sandbox = context?.sandbox
  const commands = sandbox?.commands
  if (!sandbox || !commands || typeof commands.run !== 'function') return context

  const originalRun = commands.run.bind(commands)
  const originalPersist = typeof sandbox.persist === 'function'
    ? sandbox.persist.bind(sandbox)
    : undefined

  const wrappedCommands = new Proxy(commands, {
    get(target, property) {
      if (property === 'run') {
        return (...args: any[]) => runWithSandboxCancellation(
          signal,
          sandbox,
          () => originalRun(...args),
        )
      }
      return runtimeMember(target, property)
    },
  })

  const wrappedSandbox = new Proxy(sandbox, {
    get(target, property) {
      if (property === 'commands') return wrappedCommands
      if (property === 'persist' && originalPersist) {
        return (...args: any[]) => runWithSandboxCancellation(
          signal,
          sandbox,
          () => originalPersist(...args),
        )
      }
      return runtimeMember(target, property)
    },
  })

  return new Proxy(context, {
    get(target, property) {
      if (property === 'sandbox') return wrappedSandbox
      return runtimeMember(target, property)
    },
  })
}
