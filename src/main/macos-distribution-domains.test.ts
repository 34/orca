import { afterEach, expect, it, vi } from 'vitest'
import {
  ensureMacPressAndHoldDefault,
  isOrcaPreferencesDomain
} from './macos-press-and-hold-default'
import { isOrcaAttributedPrompt } from './macos-tcc-prompt-watch'
afterEach(() => vi.unstubAllGlobals())
it('writes only the running fork preference domain and refuses the official domain', () => {
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  const read = vi.fn().mockReturnValue('unset')
  const write = vi.fn().mockReturnValue(true)
  const host = {
    platform: 'darwin' as const,
    resolveBundleIdentifier: () => 'com.stablyai.orca',
    readRecord: () => null,
    writeRecord: vi.fn(),
    readDomainPreference: read,
    writeDomainPreference: write,
    now: () => '2026-10-17T00:00:00Z'
  }
  expect(ensureMacPressAndHoldDefault(host)).toBe('foreign-bundle')
  expect(read).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
  host.resolveBundleIdentifier = () => 'com.orca34.desktop'
  expect(ensureMacPressAndHoldDefault(host)).toBe('applied')
  expect(write).toHaveBeenCalledExactlyOnceWith('com.orca34.desktop', false)
  expect(isOrcaPreferencesDomain('com.orca34.desktop.dev.test')).toBe(true)
  expect(isOrcaPreferencesDomain('com.orca34.desktopfake')).toBe(false)
})
it('attributes only the current product and its known helper variants', () => {
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  const event = {
    service: 'kTCCServiceSystemPolicyDocumentsFolder',
    accessingIdentifier: 'test.agent',
    responsibleIdentifier: 'com.orca34.desktop'
  }
  for (const suffix of ['', '.helper', '.dev', '.dev.helper', '.local', '.local.helper']) {
    expect(
      isOrcaAttributedPrompt({
        ...event,
        responsibleIdentifier: `${event.responsibleIdentifier}${suffix}`
      })
    ).toBe(true)
  }
  expect(isOrcaAttributedPrompt({ ...event, responsibleIdentifier: 'com.stablyai.orca' })).toBe(
    false
  )
  expect(
    isOrcaAttributedPrompt({ ...event, responsibleIdentifier: 'com.orca34.desktopfake' })
  ).toBe(false)
})
