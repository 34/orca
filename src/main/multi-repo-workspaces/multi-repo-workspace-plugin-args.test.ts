import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { multiRepoContextSchema } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { tokenizeStartupCommand } from '../../shared/tui-agent-startup-shell'
import { multiRepoPluginLaunchArgs } from './multi-repo-workspace-plugin-args'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

it.each(['posix', 'powershell', 'cmd'] as const)(
  'applies Codex choices after inherited flags and before the %s prompt boundary',
  async (shell) => {
    const context = multiRepoContextSchema.parse({
      plugins: {
        codex: [
          { id: 'proof@local', enabled: true },
          { id: 'other@local.example', enabled: false }
        ]
      }
    })
    const args = await multiRepoPluginLaunchArgs(
      'codex',
      context,
      {
        agentDefaultArgs: { codex: '--model auto -- prompt' },
        terminalWindowsShell: shell === 'cmd' ? 'cmd.exe' : 'powershell.exe'
      },
      shell === 'posix' ? 'darwin' : 'win32'
    )
    expect(tokenizeStartupCommand(args ?? '', shell)).toMatchObject({
      ok: true,
      tokens: [
        '--model',
        'auto',
        '-c',
        'plugins={"proof@local"={enabled=true},"other@local.example"={enabled=false}}',
        '--',
        'prompt'
      ]
    })
  }
)

it('verifies Cursor plugin directories and carries paths with spaces as one argument', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orca-plugin-')))
  roots.push(root)
  const directory = join(root, '中文 plugin')
  await mkdir(join(directory, '.cursor-plugin'), { recursive: true })
  await writeFile(join(directory, '.cursor-plugin/plugin.json'), JSON.stringify({ name: 'proof' }))
  const context = multiRepoContextSchema.parse({
    agentArgs: '--sandbox enabled -- prompt',
    plugins: { cursorDirectories: [directory] }
  })
  for (const shell of ['posix', 'powershell', 'cmd'] as const) {
    const args = await multiRepoPluginLaunchArgs(
      'cursor',
      context,
      {
        agentDefaultArgs: { cursor: '--model inherited' },
        terminalWindowsShell: shell === 'cmd' ? 'cmd.exe' : 'powershell.exe'
      },
      shell === 'posix' ? 'darwin' : 'win32'
    )
    expect(tokenizeStartupCommand(args ?? '', shell)).toMatchObject({
      ok: true,
      tokens: ['--sandbox', 'enabled', '--plugin-dir', directory, '--', 'prompt']
    })
  }
  await rm(join(directory, '.cursor-plugin/plugin.json'))
  await expect(multiRepoPluginLaunchArgs('cursor', context, {})).rejects.toThrow('no supported')
  await writeFile(join(directory, 'plugin.json'), 'null')
  await expect(multiRepoPluginLaunchArgs('cursor', context, {})).rejects.toThrow('missing its name')
})

it('keeps inherited/empty overrides when no matching plugins are configured', async () => {
  expect(await multiRepoPluginLaunchArgs('codex', undefined, {})).toBeUndefined()
  expect(
    await multiRepoPluginLaunchArgs('cursor', multiRepoContextSchema.parse({ agentArgs: '' }), {})
  ).toBe('')
  expect(
    await multiRepoPluginLaunchArgs(
      'claude',
      multiRepoContextSchema.parse({
        plugins: { cursorDirectories: ['/missing'] }
      }),
      {}
    )
  ).toBeUndefined()
})

it('rejects contradictory plugin choices and malformed identifiers at the persistence boundary', () => {
  for (const codex of [
    [
      { id: 'proof@local', enabled: true },
      { id: 'proof@local', enabled: false }
    ],
    [{ id: 'bad".trust@local', enabled: true }]
  ]) {
    expect(() => multiRepoContextSchema.parse({ plugins: { codex } })).toThrow()
  }
})
