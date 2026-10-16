import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/app-data'),
    setPath: vi.fn(),
    commandLine: { getSwitchValue: vi.fn(() => '') }
  }
}))

it('isolates packaged Orca 34 data before canonical path capture', async () => {
  const { app } = await import('electron')
  const { configureDevUserDataPath } = await import('./configure-process')
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  try {
    vi.mocked(app.setPath).mockClear()
    configureDevUserDataPath(false)
    expect(app.setPath).toHaveBeenCalledWith('userData', join('/tmp/app-data', 'orca34'))
    vi.stubEnv('ORCA_DEV_USER_DATA_PATH', '')
    configureDevUserDataPath(true)
    expect(app.setPath).toHaveBeenCalledWith('userData', join('/tmp/app-data', 'orca34-dev'))
    vi.stubEnv('ORCA_DEV_USER_DATA_PATH', '/tmp/explicit-fork-profile')
    configureDevUserDataPath(true)
    expect(app.setPath).toHaveBeenCalledWith('userData', '/tmp/explicit-fork-profile')
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  }
})

it('preserves Electron’s explicit packaged user-data-dir instead of replacing it with the fork default', async () => {
  const { app } = await import('electron')
  const { configureDevUserDataPath } = await import('./configure-process')
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  vi.mocked(app.commandLine.getSwitchValue).mockImplementation((name) =>
    name === 'user-data-dir' ? '/tmp/explicit-packaged-profile' : ''
  )
  vi.mocked(app.setPath).mockClear()
  try {
    configureDevUserDataPath(false)
    expect(app.setPath).not.toHaveBeenCalled()
  } finally {
    vi.mocked(app.commandLine.getSwitchValue).mockReturnValue('')
    vi.unstubAllGlobals()
  }
})
