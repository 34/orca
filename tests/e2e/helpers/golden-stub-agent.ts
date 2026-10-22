import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect } from '@stablyai/playwright-test'
import { focusActiveTerminalInput, resolveActiveTabId } from './terminal'
import { readActiveScreen } from './alt-screen-frame'
import type { BuiltInWindowsTerminalShell } from '../../../src/shared/windows-terminal-shell'

export const GOLDEN_STUB_READY_MARKER = 'GOLDEN_STUB_AGENT_READY'
export const GOLDEN_STUB_EXIT_MARKER = 'GOLDEN_STUB_AGENT_EXITED'

/** Agents exposed by the fixture directory for tab-bar detection. */
export const GOLDEN_STUB_AGENTS = [
  { id: 'codex', menuItemName: /^Codex(?:\s|$)/i },
  { id: 'claude', menuItemName: /^Claude(?:\s|$)/i }
] as const

const fixtureDir = path.join(process.cwd(), 'tests', 'e2e', 'fixtures', 'golden-stub-agent')

export function getGoldenStubAgentLaunchEnv(): NodeJS.ProcessEnv {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  return {
    [pathKey]: [fixtureDir, process.env[pathKey] ?? ''].filter(Boolean).join(path.delimiter)
  }
}

export async function configureGoldenStubAgent(
  page: Page,
  options: {
    agent?: (typeof GOLDEN_STUB_AGENTS)[number]['id'] | 'grok'
    agentArgs?: string
    /** Windows default shell the launch command must survive; ignored elsewhere. */
    windowsShell?: BuiltInWindowsTerminalShell
  } = {}
): Promise<void> {
  const agent = options.agent ?? 'codex'
  await page.evaluate(
    async ({ agent, agentArgs, windowsShell }) => {
      const store = window.__store
      if (!store) {
        throw new Error('Orca store is unavailable')
      }
      await store.getState().updateSettings({
        uiLanguage: 'en',
        defaultTuiAgent: agent,
        agentCmdOverrides: { [agent]: 'golden-stub-agent' },
        agentDefaultArgs: { [agent]: agentArgs },
        ...(windowsShell ? { terminalWindowsShell: windowsShell } : {})
      })
    },
    { agent, agentArgs: options.agentArgs ?? '', windowsShell: options.windowsShell ?? null }
  )
}

export async function launchGoldenStubAgentFromNewTab(
  page: Page,
  menuItemName: RegExp = /^Codex(?:\s|$)/i
): Promise<string> {
  const previousTabId = await resolveActiveTabId(page)
  await page.getByRole('button', { name: 'New tab' }).click({ force: true })
  const launchOption = page.getByRole('menuitem', { name: menuItemName }).first()
  await expect(launchOption).toBeVisible({ timeout: 15_000 })
  await launchOption.click({ force: true })
  await expect
    .poll(async () => {
      const tabId = await resolveActiveTabId(page)
      return Boolean(tabId && tabId !== previousTabId)
    })
    .toBe(true)
  const tabId = await resolveActiveTabId(page)
  if (!tabId) {
    throw new Error('New agent tab disappeared')
  }
  await focusActiveTerminalInput(page)
  // Assert rendered text, not ANSI replay instructions produced by SerializeAddon.
  await expect
    .poll(async () => (await readActiveScreen(page, tabId))?.rows.join('\n'), {
      timeout: 20_000
    })
    .toContain(GOLDEN_STUB_READY_MARKER)
  return tabId
}
