import { afterEach, expect, it, vi } from 'vitest'
import { getOrca34InstallHealthPage } from './orca34-install-health-page'

afterEach(() => vi.unstubAllGlobals())

it('only substitutes the packaged fork page for explicit background health checks', () => {
  const env = { ORCA_BACKGROUND_LAUNCH: '1', ORCA34_INSTALL_HEALTH_CHECK: '1' }
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  expect(getOrca34InstallHealthPage(true, env)).toBe('install-health.html')
  expect(getOrca34InstallHealthPage(false, env)).toBeUndefined()
  expect(getOrca34InstallHealthPage(true, {})).toBeUndefined()
  expect(getOrca34InstallHealthPage(true, { ...env, ORCA_BACKGROUND_LAUNCH: '0' })).toBeUndefined()
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', null)
  expect(getOrca34InstallHealthPage(true, env)).toBeUndefined()
})
