import { beforeEach, expect, it, vi } from 'vitest'
import { resolveAgentStartupPlanInputs } from '../../shared/agent-startup-plan-inputs'
import { tokenizeStartupCommand } from '../../shared/tui-agent-startup-shell'
import { resolveMultiRepoWritableDirectories } from './multi-repo-workspace-placement'
import { withMultiRepoTerminalPermissions } from './multi-repo-workspace-terminal-permissions'

vi.mock('./multi-repo-workspace-placement', () => ({
  resolveMultiRepoWritableDirectories: vi.fn(async () => [])
}))

beforeEach(() => vi.resetAllMocks())

it.each(['posix', 'powershell', 'cmd'] as const)(
  'adds exact metadata grants through the existing %s quoting without changing user policy',
  async (shell) => {
    const directories =
      shell === 'posix'
        ? ['/repos/api one/.git', '/repos/中文/.git']
        : [String.raw`C:\repos\api one\.git`, String.raw`C:\repos\中文\.git`]
    vi.mocked(resolveMultiRepoWritableDirectories).mockResolvedValue(directories)
    const inputs = resolveAgentStartupPlanInputs({
      agent: 'codex',
      platform: shell === 'posix' ? 'darwin' : 'win32',
      shell,
      isRemote: false,
      settings: {},
      agentArgs: '--sandbox workspace-write --ask-for-approval never -- prompt'
    })
    const result = await withMultiRepoTerminalPermissions({}, 'folder:task', '/task', inputs)
    expect(tokenizeStartupCommand(result.agentArgs ?? '', shell)).toMatchObject({
      ok: true,
      tokens: [
        '--add-dir',
        directories[0],
        '--add-dir',
        directories[1],
        '--sandbox',
        'workspace-write',
        '--ask-for-approval',
        'never',
        '--',
        'prompt'
      ]
    })
    expect(inputs.agentArgs).toBe('--sandbox workspace-write --ask-for-approval never -- prompt')
    expect(result.agentArgs).not.toContain('bypass')
  }
)

it('leaves ordinary and remote launches alone and propagates failed identity validation', async () => {
  const inputs = resolveAgentStartupPlanInputs({
    agent: 'claude',
    platform: 'linux',
    shell: 'posix',
    isRemote: false,
    settings: {},
    agentArgs: null
  })
  vi.mocked(resolveMultiRepoWritableDirectories).mockResolvedValue([])
  expect(await withMultiRepoTerminalPermissions({}, 'repo', '/repo', inputs)).toBe(inputs)
  vi.mocked(resolveMultiRepoWritableDirectories).mockRejectedValue(new Error('identity changed'))
  const remote = { ...inputs, isRemote: true }
  expect(await withMultiRepoTerminalPermissions({}, 'folder:task', '/task', remote)).toBe(remote)
  await expect(
    withMultiRepoTerminalPermissions({}, 'folder:task', '/task', inputs)
  ).rejects.toThrow('identity changed')
})

it('adds Claude directories and refuses unsupported agents instead of weakening permissions', async () => {
  vi.mocked(resolveMultiRepoWritableDirectories).mockResolvedValue(['/repo/.git'])
  const inputs = resolveAgentStartupPlanInputs({
    agent: 'claude',
    platform: 'linux',
    shell: 'posix',
    isRemote: false,
    settings: {},
    agentArgs: null
  })
  const result = await withMultiRepoTerminalPermissions({}, 'folder:task', '/task', inputs)
  expect(tokenizeStartupCommand(result.agentArgs ?? '', 'posix')).toMatchObject({
    ok: true,
    tokens: ['--add-dir', '/repo/.git']
  })
  await expect(
    withMultiRepoTerminalPermissions({}, 'folder:task', '/task', { ...inputs, agent: 'gemini' })
  ).rejects.toThrow('not yet supported')
})
