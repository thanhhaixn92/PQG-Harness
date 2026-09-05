const RUNNER_ABORT_WRAPPED = Symbol.for('pqg.runner-owned-sandbox-cancellation')

export const M08_STOP_EPOCH_KEY = 'pqg:m08:stop-epoch'

export interface SandboxCancellationOptions {
  /** Use this request's AbortSignal only when the request owns the operation. */
  useRequestSignal?: boolean
  /** Require the cross-request EdgeOne conversation-state cancellation channel. */
  requireSharedStop?: boolean
  /** Primarily a test seam; Production defaults to a bounded 100ms poll. */
  pollIntervalMs?: number
}

function workspaceAbortError(): Error {
  const error = new Error('WORKSPACE_COMMAND_ABORTED')
  error.name = 'AbortError'
  return error
}

function stableError(name: string, code: string): Error {
  const error = new Error(code)
  error.name = name
  return error
}

function runtimeMember(target: any, property: PropertyKey): any {
  const value = Reflect.get(target, property, target)
  return typeof value === 'function' ? value.bind(target) : value
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function terminateSandbox(context: any): Promise<void> {
  const kill = context?.sandbox?.kill
  if (typeof kill !== 'function') {
    throw stableError('SandboxTerminationError', 'SANDBOX_KILL_UNAVAILABLE')
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await kill.call(context.sandbox)
      return
    } catch {
      if (attempt === 0) await sleep(25)
    }
  }
  throw stableError('SandboxTerminationError', 'SANDBOX_KILL_FAILED')
}

function sharedState(context: any): any | undefined {
  const state = context?.store?.state
  return state && typeof state.get === 'function' ? state : undefined
}

async function readStopEpoch(state: any): Promise<unknown> {
  return state.get(M08_STOP_EPOCH_KEY)
}

/**
 * Run one sandbox operation under two cancellation channels:
 * 1) the owning EdgeOne request AbortSignal when that request really owns the run;
 * 2) conversation-scoped `context.store.state`, which crosses requests/processes.
 *
 * The shared epoch is the authoritative fallback for the DSH sidecar/MCP
 * composition because DeepSeek `session.prompt` only admits work and does not
 * own the full Agent-turn lifetime. No process-local registry coordinates Stop.
 */
export async function runWithSandboxAbort<T>(
  context: any,
  operation: () => Promise<T>,
  options: SandboxCancellationOptions = {},
): Promise<T> {
  const useRequestSignal = options.useRequestSignal !== false
  const signal = useRequestSignal
    ? context?.request?.signal as AbortSignal | undefined
    : undefined
  const state = sharedState(context)
  if (options.requireSharedStop === true && !state) {
    throw stableError('CancellationUnavailableError', 'WORKSPACE_CANCELLATION_UNAVAILABLE')
  }

  if (signal?.aborted) {
    await terminateSandbox(context)
    throw workspaceAbortError()
  }

  let baselineEpoch: unknown
  if (state) {
    try {
      baselineEpoch = await readStopEpoch(state)
    } catch {
      if (options.requireSharedStop === true) {
        throw stableError('CancellationUnavailableError', 'WORKSPACE_CANCELLATION_UNAVAILABLE')
      }
      baselineEpoch = undefined
    }
  }

  let killPromise: Promise<void> | undefined
  const killOnce = (): Promise<void> => {
    killPromise ??= terminateSandbox(context)
    return killPromise
  }

  let signalCancelled = false
  let sharedCancelled = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let polling = true

  let rejectSignal!: (error: Error) => void
  const signalAbort = new Promise<never>((_resolve, reject) => {
    rejectSignal = reject
  })
  const onAbort = (): void => {
    signalCancelled = true
    void killOnce().then(
      () => rejectSignal(workspaceAbortError()),
      error => rejectSignal(error instanceof Error
        ? error
        : stableError('SandboxTerminationError', 'SANDBOX_KILL_FAILED')),
    )
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  let rejectShared!: (error: Error) => void
  const sharedAbort = new Promise<never>((_resolve, reject) => {
    rejectShared = reject
  })
  const pollIntervalMs = Math.max(20, options.pollIntervalMs ?? 100)

  const pollSharedStop = async (): Promise<void> => {
    if (!polling || !state || sharedCancelled) return
    try {
      const currentEpoch = await readStopEpoch(state)
      if (!Object.is(currentEpoch, baselineEpoch)) {
        sharedCancelled = true
        void killOnce().then(
          () => rejectShared(workspaceAbortError()),
          error => rejectShared(error instanceof Error
            ? error
            : stableError('SandboxTerminationError', 'SANDBOX_KILL_FAILED')),
        )
        return
      }
    } catch {
      if (options.requireSharedStop === true) {
        sharedCancelled = true
        rejectShared(stableError('CancellationUnavailableError', 'WORKSPACE_CANCELLATION_UNAVAILABLE'))
        return
      }
    }
    if (polling) pollTimer = setTimeout(() => { void pollSharedStop() }, pollIntervalMs)
  }

  if (state) pollTimer = setTimeout(() => { void pollSharedStop() }, pollIntervalMs)

  const ensureCancelled = async (): Promise<never> => {
    await killOnce()
    throw workspaceAbortError()
  }

  try {
    const races: Array<Promise<T>> = [operation()]
    if (signal) races.push(signalAbort)
    if (state) races.push(sharedAbort)
    const result = await Promise.race(races)

    // Recheck after Promise.race. A synchronous sandbox termination can settle
    // commands.run before the cancellation promise's rejection reaction wins.
    if (signal?.aborted || signalCancelled || sharedCancelled) {
      return await ensureCancelled()
    }

    // Close the same race for the cross-request epoch: a Stop can arrive after
    // commands.run settles but before checkpoint persistence begins.
    if (state) {
      try {
        const finalEpoch = await readStopEpoch(state)
        if (!Object.is(finalEpoch, baselineEpoch)) {
          sharedCancelled = true
          return await ensureCancelled()
        }
      } catch {
        if (options.requireSharedStop === true) {
          throw stableError('CancellationUnavailableError', 'WORKSPACE_CANCELLATION_UNAVAILABLE')
        }
      }
    }

    return result
  } catch (error) {
    if (signal?.aborted || signalCancelled || sharedCancelled) {
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
    polling = false
    if (pollTimer !== undefined) clearTimeout(pollTimer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Return a view of the current context whose sandbox command executor is
 * cancellation-aware. Only commands.run changes behavior. All other runtime
 * methods/getters retain the original EdgeOne object as their receiver.
 */
export function withRunnerOwnedSandboxCancellation(
  context: any,
  options: SandboxCancellationOptions = {},
): any {
  if (!context || context[RUNNER_ABORT_WRAPPED] === true) return context
  const sandbox = context.sandbox
  const commands = sandbox?.commands
  if (!sandbox || !commands || typeof commands.run !== 'function') return context

  const originalRun = commands.run.bind(commands)
  const wrappedCommands = new Proxy(commands, {
    get(target, property) {
      if (property === 'run') {
        return (...args: any[]) => runWithSandboxAbort(
          context,
          () => originalRun(...args),
          options,
        )
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
