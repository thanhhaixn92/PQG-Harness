const SANDBOX_KILL_ATTEMPT_TIMEOUT_MS = 1_000

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

async function killSandboxWithDeadline(sandbox: any): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve().then(() => sandbox.kill()),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('sandbox kill timeout')), SANDBOX_KILL_ATTEMPT_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function terminateSandbox(sandbox: any): Promise<void> {
  if (typeof sandbox?.kill !== 'function') {
    throw stableError('SandboxTerminationError', 'SANDBOX_KILL_UNAVAILABLE')
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await killSandboxWithDeadline(sandbox)
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
  if (signal.aborted) {
    await terminateSandbox(sandbox)
    throw workspaceAbortError()
  }

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
    if (cancelled) {
      await killOnce()
      throw workspaceAbortError()
    }
    const result = await Promise.race([operation(), abortPromise])
    if (signal.aborted || cancelled) {
      await killOnce()
      throw workspaceAbortError()
    }
    return result
  } catch (error) {
    if (signal.aborted || cancelled) {
      try {
        await killOnce()
      } catch (killError) {
        throw killError
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
  const originalRestore = typeof sandbox.restore === 'function'
    ? sandbox.restore.bind(sandbox)
    : undefined
  const files = sandbox.files

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

  const wrappedFiles = files
    ? new Proxy(files, {
        get(target, property) {
          if ((property === 'write' || property === 'makeDir') && typeof target[property] === 'function') {
            const operation = target[property].bind(target)
            return (...args: any[]) => runWithSandboxCancellation(
              signal,
              sandbox,
              () => operation(...args),
            )
          }
          return runtimeMember(target, property)
        },
      })
    : undefined

  const wrappedSandbox = new Proxy(sandbox, {
    get(target, property) {
      if (property === 'commands') return wrappedCommands
      if (property === 'files' && wrappedFiles) return wrappedFiles
      if (property === 'persist' && originalPersist) {
        return (...args: any[]) => runWithSandboxCancellation(
          signal,
          sandbox,
          () => originalPersist(...args),
        )
      }
      if (property === 'restore' && originalRestore) {
        return (...args: any[]) => runWithSandboxCancellation(
          signal,
          sandbox,
          () => originalRestore(...args),
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
