import { isAbsolute, join } from 'node:path'
import { readFile, realpath, stat } from 'node:fs/promises'
import type { MultiRepoContext } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import {
  resolveAgentStartupPlanInputs,
  type AgentStartupSettings
} from '../../shared/agent-startup-plan-inputs'
import type { TuiAgent } from '../../shared/tui-agent'
import {
  quoteStartupArg,
  resolveStartupShell,
  tokenizeStartupCommand
} from '../../shared/tui-agent-startup-shell'
import { agentArgTerminatorIndex } from '../../shared/agent-session-option-agent-args'

async function cursorPluginDirectory(directory: string): Promise<string> {
  if (!isAbsolute(directory) || !(await stat(directory)).isDirectory()) {
    throw new Error('Cursor plugin must be an existing absolute directory')
  }
  const canonical = await realpath(directory)
  for (const path of [
    join(canonical, '.cursor-plugin', 'plugin.json'),
    join(canonical, '.claude-plugin', 'plugin.json'),
    join(canonical, 'plugin.json')
  ]) {
    try {
      const info = await stat(path)
      if (!info.isFile() || info.size > 1024 * 1024) {
        throw new Error('Cursor plugin manifest must be a JSON file under 1 MB')
      }
      const manifest = JSON.parse(await readFile(path, 'utf8'))
      if (
        !manifest ||
        typeof manifest !== 'object' ||
        typeof manifest.name !== 'string' ||
        !manifest.name.trim()
      ) {
        throw new Error('Cursor plugin manifest is missing its name')
      }
      return canonical
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error
      }
    }
  }
  throw new Error('Cursor plugin directory has no supported plugin manifest')
}

export async function multiRepoPluginLaunchArgs(
  agent: TuiAgent,
  context: MultiRepoContext | undefined,
  settings: AgentStartupSettings,
  platform: NodeJS.Platform = process.platform
): Promise<string | undefined> {
  const plugins = context?.plugins
  const flags: string[] = []
  if (agent === 'codex') {
    const entries = plugins?.codex ?? []
    if (entries.length > 0) {
      // CLI dotted keys split literally; TOML inline keys preserve quotes and marketplace dots.
      const table = entries
        .map((plugin) => `${JSON.stringify(plugin.id)}={enabled=${plugin.enabled}}`)
        .join(',')
      flags.push('-c', `plugins={${table}}`)
    }
  } else if (agent === 'cursor') {
    for (const directory of plugins?.cursorDirectories ?? []) {
      flags.push('--plugin-dir', await cursorPluginDirectory(directory))
    }
  }
  if (flags.length === 0) {
    return context?.agentArgs
  }
  const inputs = resolveAgentStartupPlanInputs({
    agent,
    platform,
    shell: undefined,
    isRemote: false,
    settings,
    agentArgs: context?.agentArgs
  })
  const shell = resolveStartupShell(platform, inputs.shell)
  const parsed = tokenizeStartupCommand(inputs.agentArgs ?? '', shell)
  if (!parsed.ok || parsed.spans.some((span) => span.divergesFromShell)) {
    throw new Error('Plugin settings require literal agent startup arguments')
  }
  const boundary = agentArgTerminatorIndex(agent, parsed.tokens)
  const tokens = [...parsed.tokens.slice(0, boundary), ...flags, ...parsed.tokens.slice(boundary)]
  const combined = tokens.map((token) => quoteStartupArg(token, shell)).join(' ')
  const checked = tokenizeStartupCommand(combined, shell)
  if (
    !checked.ok ||
    checked.tokens.some((token, index) => token !== tokens[index]) ||
    checked.tokens.length !== tokens.length
  ) {
    throw new Error('Plugin arguments cannot be represented in the startup shell')
  }
  return combined
}
