import { beforeEach, expect, it, vi } from 'vitest'
import { resolveAgentStartupPlanInputs } from '../../shared/agent-startup-plan-inputs'
import { tokenizeStartupCommand } from '../../shared/tui-agent-startup-shell'
import { resolveMultiRepoWritableDirectories } from './multi-repo-workspace-placement'
import { withMultiRepoTerminalPermissions } from './multi-repo-workspace-terminal-permissions'
import { resolveAgentLaunchCommand } from '../../shared/tui-agent-launch-command'

vi.mock('./multi-repo-workspace-placement', () => ({
  resolveMultiRepoWritableDirectories: vi.fn(async () => [])
}))

beforeEach(() => vi.resetAllMocks())

it.each(['posix', 'powershell', 'cmd'] as const)(
  'carries Cursor metadata grants through the final %s launch without granting unrestricted access',
  async (shell) => {
    const directory =
      shell === 'posix' ? '/repos/中文 api/.git' : String.raw`C:\repos\中文 api\.git`
    vi.mocked(resolveMultiRepoWritableDirectories).mockResolvedValue([directory])
    const platform = shell === 'posix' ? 'darwin' : 'win32'
    const inputs = resolveAgentStartupPlanInputs({
      agent: 'cursor',
      platform,
      shell,
      isRemote: false,
      settings: {},
      agentArgs: '--sandbox enabled --model auto -- prompt'
    })
    const permitted = await withMultiRepoTerminalPermissions({}, 'folder:task', '/task', inputs)
    const launch = resolveAgentLaunchCommand({
      agent: 'cursor',
      platform,
      shell,
      cmdOverrides: {},
      agentArgs: permitted.agentArgs
    })
    if (!launch.ok) {
      throw new Error(launch.error)
    }
    expect(tokenizeStartupCommand(launch.command, shell)).toMatchObject({
      ok: true,
      tokens: [
        'cursor-agent',
        '--add-dir',
        directory,
        '--sandbox',
        'enabled',
        '--model',
        'auto',
        '--',
        'prompt'
      ]
    })
    expect(inputs.agentArgs).toBe('--sandbox enabled --model auto -- prompt')
  }
)

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
