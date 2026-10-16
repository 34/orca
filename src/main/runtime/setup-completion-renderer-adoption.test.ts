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
      surfaceOwner: false
    })
    expect(result.setupSpawned).toBe(true)
    const token = runtime.completionToken('pty-setup-adopted')
    expect(token).toBeTypeOf('string')
    if (adoption === 'before-wait') {
      syncSinglePty(runtime, 'pty-setup-adopted')
    }
    if (!result.setupTerminalHandle) {
      throw new Error('Missing setup handle')
    }
    const waiting = runtime.waitForSetupTerminalCompletion(result.setupTerminalHandle)
    const completed = expect(waiting).resolves.toEqual({ exitCode: 7 })
    runtime.onPtyData('pty-setup-adopted', `\r\n__ORCA_SETUP_COMPLETE__:${token}:7\r\n`, 100)
    await completed
    await expect(runtime.waitForSetupTerminalCompletion('unknown-setup-handle')).rejects.toThrow(
      'terminal_handle_stale'
    )
  }
)
