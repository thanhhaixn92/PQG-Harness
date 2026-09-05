const RUNNER_ABORT_WRAPPED = Symbol.for('pqg.runner-owned-sandbox-cancellation')

export const M08_STOP_EPOCH_KEY = 'pqg:m08:stop-epoch'

export interface SharedStopBaseline {
  readonly value: unknown
}

export interface SandboxCancellationOptions {
  /** Use this request's AbortSignal only when the request owns the operation. */
  useRequestSignal?: boolean
  /** Require the cross-request EdgeOne conversation-state cancellation channel. */
  requireSharedStop?: boolean
  /** Fixed Stop fence captured by a long-lived owner such as the MCP bridge. */
  sharedStopBaseline?: SharedStopBaseline
  /** Exact sandbox instance that owns the dispatched command. */
  sandbox?: any
  /** Primarily a test seam; Production defaults to a bounded 100ms poll. */
  pollIntervalMs?: number
}

function workspaceAbortError(): Error {
  const error = new Error('WORKSPACE_COMMAND_ABORTED')
  error.name = 'AbortError'
  return error
}

function cancellationUnavailableError(): Error {
  return stableError('CancellationUnavailableError', 'WORKSPACE_CANCELLATION_UNAVAILABLE')
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

async function terminateSandbox(sandbox: any): Promise<void> {
  const kill = sandbox?.kill
  if (typeof kill !== 'function') {
    throw stableError('SandboxTerminationError', 'SANDBOX_KILL_UNAVAILABLE')
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await kill.call(sandbox)
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

/** Capture a Stop fence before handing work to a long-lived owner. */
export async function captureSharedStopBaseline(context: any): Promise<SharedStopBaseline> {
  const state = sharedState(context)
  if (!state) throw cancellationUnavailableError()
  try {
    return Object.freeze({ value: await readStopEpoch(state) })
  } catch {
    throw cancellationUnavailableError()
  }
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
  const sandbox = options.sandbox ?? context?.sandbox
  if (options.requireSharedStop === true && !state) {
    throw cancellationUnavailableError()
  }

  let killPromise: Promise<void> | undefined
  const killOnce = (): Promise<void> => {
    killPromise ??= terminateSandbox(sandbox)
    return killPromise
  }

  if (signal?.aborted) {
    await killOnce()
    throw workspaceAbortError()
  }

  let signalCancelled = false
  let sharedCancelled = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let polling = true

  let rejectSignal!: (error: Error) => void
  const signalAbort = new Promise<never>((_resolve, reject) => {
    rejectSignal = reject
  })
  // The listener is installed before any shared-state await. The catch prevents
  // an abort during that await from becoming an unhandled rejection before the
  // command race is assembled.
  void signalAbort.catch(() => {})
  const onAbort = (): void => {
    if (signalCancelled) return
    signalCancelled = true
    void killOnce().then(
      () => rejectSignal(workspaceAbortError()),
      error => rejectSignal(error instanceof Error
        ? error
        : stableError('SandboxTerminationError', 'SANDBOX_KILL_FAILED')),
    )
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) onAbort()

  const ensureSignalStillActive = async (): Promise<void> => {
    if (!signal?.aborted && !signalCancelled) return
    await killOnce()
    throw workspaceAbortError()
  }

  let baselineEpoch: unknown
  try {
    if (state) {
      if (options.sharedStopBaseline !== undefined) {
        baselineEpoch = options.sharedStopBaseline.value
        let currentEpoch: unknown
        try {
          currentEpoch = await readStopEpoch(state)
        } catch {
          if (options.requireSharedStop === true) {
            await killOnce()
            throw cancellationUnavailableError()
          }
          currentEpoch = baselineEpoch
        }
        await ensureSignalStillActive()
        if (!Object.is(currentEpoch, baselineEpoch)) {
          sharedCancelled = true
          await killOnce()
          throw workspaceAbortError()
        }
      } else {
        try {
          baselineEpoch = await readStopEpoch(state)
        } catch {
          if (options.requireSharedStop === true) {
            await killOnce()
            throw cancellationUnavailableError()
          }
          baselineEpoch = undefined
        }
        await ensureSignalStillActive()
      }
    } else {
      await ensureSignalStillActive()
    }

    let rejectShared!: (error: Error) => void
    const sharedAbort = new Promise<never>((_resolve, reject) => {
      rejectShared = reject
    })
    void sharedAbort.catch(() => {})
    const pollIntervalMs = Math.max(20, options.pollIntervalMs ?? 100)

    const pollSharedStop = async (): Promise<void> => {
      if (!polling || !state || sharedCancelled) return
      try {
        const currentEpoch = await readStopEpoch(state)
        // A timer can expire while the read is in flight. Once this wrapper has
        // relinquished ownership, that stale observation must never kill later work.
        if (!polling) return
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
        if (!polling) return
        if (options.requireSharedStop === true) {
          const unavailable = cancellationUnavailableError()
          void killOnce().then(
            () => rejectShared(unavailable),
            error => rejectShared(error instanceof Error
              ? error
              : stableError('SandboxTerminationError', 'SANDBOX_KILL_FAILED')),
          )
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
        let finalEpoch: unknown
        try {
          finalEpoch = await readStopEpoch(state)
        } catch {
          if (options.requireSharedStop === true) {
            await killOnce()
            throw cancellationUnavailableError()
          }
          finalEpoch = baselineEpoch
        }

        // The request signal can change while the final shared-state read is pending.
        if (signal?.aborted || signalCancelled) {
          return await ensureCancelled()
        }
        if (!Object.is(finalEpoch, baselineEpoch)) {
          sharedCancelled = true
          return await ensureCancelled()
        }
      }

      return result
    } catch (error) {
      if (error instanceof Error && error.name === 'CancellationUnavailableError') {
        await killOnce()
        throw error
      }
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
    }
  } finally {
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
          { ...options, sandbox },
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
