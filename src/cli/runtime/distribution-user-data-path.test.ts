import { afterEach, expect, it, vi } from 'vitest'
import { join, resolve } from 'node:path'
import { getDefaultUserDataPath, getPlatformUserDataPath } from './metadata'
import { resolveLaunchUserDataPath } from './launch-user-data-path'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
it('selects the fork profile on every platform and preserves explicit profile routing', () => {
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  vi.stubEnv('APPDATA', '/appdata')
  vi.stubEnv('XDG_CONFIG_HOME', '/config')
  expect(getPlatformUserDataPath('darwin', '/home')).toBe(
    join('/home', 'Library', 'Application Support', 'orca34')
  )
  expect(getPlatformUserDataPath('win32', '/home')).toBe(join('/appdata', 'orca34'))
  expect(getPlatformUserDataPath('linux', '/home')).toBe(join('/config', 'orca34'))
  expect(resolveLaunchUserDataPath({ ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1' })).toBe(
    resolve(getPlatformUserDataPath(), '..', 'orca34-dev')
  )
  vi.stubEnv('ORCA_USER_DATA_PATH', '/explicit/profile')
  expect(getDefaultUserDataPath()).toBe('/explicit/profile')
  expect(resolveLaunchUserDataPath({ ORCA_USER_DATA_PATH: '/explicit/profile' })).toBe(
    resolve('/explicit/profile')
  )
})
it('ignores runtime distribution env when selecting the official profile', () => {
  vi.stubEnv('ORCA_BUILD_DISTRIBUTION', 'orca34')
  expect(getPlatformUserDataPath('darwin', '/home')).toBe(
    join('/home', 'Library', 'Application Support', 'orca')
  )
})
