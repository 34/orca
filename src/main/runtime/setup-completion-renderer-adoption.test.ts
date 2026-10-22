import './orca-runtime-test-lifecycle.spec'
import { expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime-test-mocks.spec'
import {
  store,
  syncSinglePty,
  TEST_WORKTREE_ID,
  TEST_WORKTREE_PATH
} from './orca-runtime-test-fixtures.spec'

class SetupRuntime extends OrcaRuntimeService {
  completionToken(ptyId: string) {
    return this.setupCompletionTokenByPtyId.get(ptyId)
  }
}

it.each(['before-token', 'before-wait'] as const)(
  'observes setup when the renderer adopts its handle %s',
  async (adoption) => {
    const runtime = new SetupRuntime(store)
    runtime.setPtyController({
      spawn: vi.fn().mockResolvedValue({ id: 'pty-setup-adopted' }),
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null
    })
    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, { tabs: [], leaves: [] })
    const create = runtime.createTerminal.bind(runtime)
    vi.spyOn(runtime, 'createTerminal').mockImplementation(async (selector, options, created) => {
      const terminal = await create(
        selector,
        { ...options, tabId: 'tab-1', leafId: 'pane:1' },
        created
      )
      if (adoption === 'before-token') {
        syncSinglePty(runtime, 'pty-setup-adopted')
      }
      return terminal
    })
    const result = await runtime.provisionManagedWorktreeTerminals({
      worktreeSelector: `path:${TEST_WORKTREE_PATH}`,
      worktreeId: TEST_WORKTREE_ID,
      worktreePath: TEST_WORKTREE_PATH,
      setup: { runnerScriptPath: '/repo/setup.sh', envVars: {} },
      setupOnly: true,
      hasStartupTerminal: false,
      setupCommandPlatform: 'posix',
      observeSetupCompletion: true,
      setupCompletionToken: '550e8400-e29b-41d4-a716-446655440000',
      surfaceOwner: false
    })
    expect(result.setupSpawned).toBe(true)
    const token = runtime.completionToken('pty-setup-adopted')
    expect(token).toBe('550e8400-e29b-41d4-a716-446655440000')
    if (adoption === 'before-wait') {
      syncSinglePty(runtime, 'pty-setup-adopted')
    }
    if (!result.setupTerminalHandle) {
      throw new Error('Missing setup handle')
    }
    await expect(
      runtime.waitForSetupTerminalCompletion(
        result.setupTerminalHandle,
        undefined,
        'different-token'
      )
    ).rejects.toThrow('Setup completion identity changed')
    const waiting = runtime.waitForSetupTerminalCompletion(result.setupTerminalHandle)
    const completed = expect(waiting).resolves.toEqual({ exitCode: 7 })
    runtime.onPtyData('pty-setup-adopted', `\r\n__ORCA_SETUP_COMPLETE__:${token}:7\r\n`, 100)
    await completed
    await expect(runtime.waitForSetupTerminalCompletion('unknown-setup-handle')).rejects.toThrow(
      'terminal_handle_stale'
    )
  }
)

it.each(['matching', 'wrong-token', 'missing'] as const)(
  'uses only the persisted token in a retained provider snapshot (%s)',
  async (scenario) => {
    const runtime = new SetupRuntime(store)
    const serializeProviderBuffer = vi.fn(async () => ({
      data:
        scenario === 'missing'
          ? 'shell prompt'
          : `__ORCA_SETUP_COMPLETE__:${scenario === 'matching' ? 'saved-token' : 'other-token'}:7\r\n`,
      source: 'headless' as const,
      seq: 1,
      cols: 80,
      rows: 24
    }))
    runtime.setPtyController({
      spawn: vi.fn().mockResolvedValue({ id: 'pty-retained-setup' }),
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null,
      serializeProviderBuffer
    })
    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, { tabs: [], leaves: [] })
    const { handle } = await runtime.createTerminal(`path:${TEST_WORKTREE_PATH}`)
    expect(runtime.completionToken('pty-retained-setup')).toBeUndefined()
    const abort = new AbortController()
    const waiting = runtime.waitForSetupTerminalCompletion(handle, abort.signal, 'saved-token')
    if (scenario === 'matching') {
      await expect(waiting).resolves.toEqual({ exitCode: 7 })
    } else {
      await vi.waitFor(() => expect(serializeProviderBuffer).toHaveBeenCalled())
      abort.abort(new Error('observation cancelled'))
      await expect(waiting).rejects.toThrow('observation cancelled')
    }
  }
)

it.each(['complete', 'abort'] as const)(
  'observes later provider output without a live data stream (%s)',
  async (outcome) => {
    const runtime = new SetupRuntime(store)
    const snapshot = {
      data: 'setup still running',
      source: 'headless' as const,
      seq: 1,
      cols: 80,
      rows: 24
    }
    const serializeProviderBuffer = vi.fn(async () => snapshot)
    runtime.setPtyController({
      spawn: vi.fn().mockResolvedValue({ id: 'pty-background-setup' }),
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null,
      serializeProviderBuffer
    })
    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, { tabs: [], leaves: [] })
    const { handle } = await runtime.createTerminal(`path:${TEST_WORKTREE_PATH}`)
    vi.useFakeTimers()
    try {
      const abort = new AbortController()
      const waiting = runtime.waitForSetupTerminalCompletion(handle, abort.signal, 'saved-token')
      const result =
        outcome === 'complete'
          ? expect(waiting).resolves.toEqual({ exitCode: 0 })
          : expect(waiting).rejects.toThrow('stop observing')
      await vi.advanceTimersByTimeAsync(0)
      expect(serializeProviderBuffer).toHaveBeenCalledTimes(1)
      snapshot.data = '__ORCA_SETUP_COMPLETE__:saved-token:0\r\n'
      if (outcome === 'abort') {
        abort.abort(new Error('stop observing'))
      }
      await vi.advanceTimersByTimeAsync(1000)
      await result
      expect(serializeProviderBuffer).toHaveBeenCalledTimes(outcome === 'complete' ? 2 : 1)
      await vi.advanceTimersByTimeAsync(2000)
      expect(serializeProviderBuffer).toHaveBeenCalledTimes(outcome === 'complete' ? 2 : 1)
    } finally {
      vi.useRealTimers()
    }
  }
)
