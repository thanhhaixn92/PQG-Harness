const RUNNER_ABORT_WRAPPED = Symbol.for('pqg.runner-owned-sandbox-cancellation')

export const M08_STOP_EPOCH_KEY = 'pqg:m08:stop-epoch'
export const M08_STOP_EPOCH_METADATA_KEY = 'pqgM08StopEpoch'

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
  /** Explicit conversation target for the cross-process metadata fence. */
  conversationId?: string
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

function normalizeStopEpoch(value: unknown): unknown {
  return value === null || value === undefined ? null : value
}

function sharedState(context: any): any | undefined {
  const state = context?.store?.state
  return state && typeof state.get === 'function' ? state : undefined
}

function hasConversationMetadataChannel(context: any, conversationId?: string): boolean {
  return Boolean(
    conversationId
    && typeof context?.store?.getConversation === 'function',
  )
}

function isMissingConversation(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
  const message = error instanceof Error ? error.message : String(error)
  return code === 'MemoryNotFoundError' || /Conversation not found/i.test(message)
}

async function getConversationForCancellation(context: any, conversationId: string): Promise<any | null> {
  const getConversation = context?.store?.getConversation
  if (typeof getConversation !== 'function') throw cancellationUnavailableError()
  try {
    return await getConversation.call(context.store, { conversationId })
  } catch (firstError) {
    try {
      return await getConversation.call(context.store, conversationId)
    } catch (secondError) {
      if (isMissingConversation(firstError) || isMissingConversation(secondError)) return null
      throw firstError
    }
  }
}

async function readStopEpoch(context: any, conversationId?: string): Promise<unknown> {
  if (hasConversationMetadataChannel(context, conversationId)) {
    const conversation = await getConversationForCancellation(context, conversationId!)
    return normalizeStopEpoch(conversation?.metadata?.[M08_STOP_EPOCH_METADATA_KEY])
  }

  const state = sharedState(context)
  if (!state) throw cancellationUnavailableError()
  return normalizeStopEpoch(await state.get(M08_STOP_EPOCH_KEY))
}

function hasSharedStopChannel(context: any, conversationId?: string): boolean {
  return hasConversationMetadataChannel(context, conversationId) || Boolean(sharedState(context))
}

/** Capture a Stop fence before handing work to a long-lived owner. */
export async function captureSharedStopBaseline(
  context: any,
  conversationId?: string,
): Promise<SharedStopBaseline> {
  if (!hasSharedStopChannel(context, conversationId)) throw cancellationUnavailableError()
  try {
    return Object.freeze({ value: await readStopEpoch(context, conversationId) })
  } catch {
    throw cancellationUnavailableError()
  }
}

async function assertSharedStopBaselineCurrent(
  context: any,
  baseline: SharedStopBaseline,
  options: SandboxCancellationOptions,
): Promise<void> {
  try {
    const currentEpoch = await readStopEpoch(context, options.conversationId)
    if (!Object.is(currentEpoch, normalizeStopEpoch(baseline.value))) {
      throw workspaceAbortError()
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (options.requireSharedStop === true) throw cancellationUnavailableError()
  }
}

/**
 * Run one sandbox operation under two cancellation channels:
 * 1) the owning EdgeOne request AbortSignal when that request really owns the run;
 * 2) an explicit conversation metadata fence when a conversation id is available,
 *    otherwise conversation-scoped `context.store.state`.
 *
 * The shared fence is the authoritative fallback for the DSH sidecar/MCP
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
  const sharedStopAvailable = hasSharedStopChannel(context, options.conversationId)
  const sandbox = options.sandbox ?? context?.sandbox
  if (options.requireSharedStop === true && !sharedStopAvailable) {
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
  let sharedFailure: Error | undefined
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let polling = true

  let rejectSignal!: (error: Error) => void
  const signalAbort = new Promise<never>((_resolve, reject) => {
    rejectSignal = reject
  })
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
    if (sharedStopAvailable) {
      if (options.sharedStopBaseline !== undefined) {
        baselineEpoch = normalizeStopEpoch(options.sharedStopBaseline.value)
        let currentEpoch: unknown
        try {
          currentEpoch = await readStopEpoch(context, options.conversationId)
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
          baselineEpoch = await readStopEpoch(context, options.conversationId)
        } catch {
          if (options.requireSharedStop === true) {
            await killOnce()
            throw cancellationUnavailableError()
          }
          baselineEpoch = null
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
      if (!polling || !sharedStopAvailable || sharedCancelled || sharedFailure) return
      try {
        const currentEpoch = await readStopEpoch(context, options.conversationId)
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
          sharedFailure = cancellationUnavailableError()
          void killOnce().then(
            () => rejectShared(sharedFailure!),
            error => rejectShared(error instanceof Error
              ? error
              : stableError('SandboxTerminationError', 'SANDBOX_KILL_FAILED')),
          )
          return
        }
      }
      if (polling) pollTimer = setTimeout(() => { void pollSharedStop() }, pollIntervalMs)
    }

    if (sharedStopAvailable) pollTimer = setTimeout(() => { void pollSharedStop() }, pollIntervalMs)

    const ensureCancelled = async (): Promise<never> => {
      await killOnce()
      throw workspaceAbortError()
    }

    try {
      const races: Array<Promise<T>> = [operation()]
      if (signal) races.push(signalAbort)
      if (sharedStopAvailable) races.push(sharedAbort)
      const result = await Promise.race(races)

      if (sharedFailure) {
        await killOnce()
        throw sharedFailure
      }
      if (signal?.aborted || signalCancelled || sharedCancelled) {
        return await ensureCancelled()
      }

      if (sharedStopAvailable) {
        let finalEpoch: unknown
        try {
          finalEpoch = await readStopEpoch(context, options.conversationId)
        } catch {
          if (options.requireSharedStop === true) {
            await killOnce()
            throw cancellationUnavailableError()
          }
          finalEpoch = baselineEpoch
        }

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
      if (sharedFailure) {
        await killOnce()
        throw sharedFailure
      }
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
 * cancellation-aware. Commands bind physical termination to the exact sandbox
 * handle; checkpoint persistence rechecks the same fixed Stop fence immediately
 * before the runtime persist call.
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
  const originalPersist = typeof sandbox.persist === 'function'
    ? sandbox.persist.bind(sandbox)
    : undefined
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
      if (property === 'persist' && originalPersist && options.sharedStopBaseline !== undefined) {
        return async (...args: any[]) => {
          await assertSharedStopBaselineCurrent(context, options.sharedStopBaseline!, options)
          return originalPersist(...args)
        }
      }
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
