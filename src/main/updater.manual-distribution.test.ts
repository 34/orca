import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { UpdateCheckOptions } from '../shared/update-status-types'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const {
  appMock,
  autoUpdaterMock,
  chooseLocalBuildMock,
  fetchNudgeMock,
  fetchNewerReleaseTagsMock,
  powerMonitorOnMock,
  moduleFactories,
  resetUpdaterMocks
} = await vi.hoisted(async () => (await import('./updater-test-harness')).createUpdaterMocks())
const loadElectronAutoUpdater = vi.hoisted(() => vi.fn())
vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => ({ loadElectronAutoUpdater }))
vi.mock('@electron-toolkit/utils', () => moduleFactories.electronToolkitUtils())
vi.mock('./ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())
warmUpdaterModule()

beforeEach(() => {
  resetUpdaterMocks()
  loadElectronAutoUpdater.mockReset().mockReturnValue(autoUpdaterMock)
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('does not initialize the updater, register wake checks or poll a feed in manual builds', async () => {
  vi.useFakeTimers()
  const updater = await loadUpdaterModule()
  updater.setupAutoUpdater(null)
  updater.checkForUpdates()
  await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000)
  expect(updater.getUpdateStatus()).toEqual({ state: 'idle' })
  expect(loadElectronAutoUpdater).not.toHaveBeenCalled()
  expect(powerMonitorOnMock).not.toHaveBeenCalled()
  expect(fetchNudgeMock).not.toHaveBeenCalled()
  expect(fetchNewerReleaseTagsMock).not.toHaveBeenCalled()
})

const checks: UpdateCheckOptions[] = [
  {},
  { includePrerelease: true },
  { localBuild: true },
  { channel: 'hourly', targetTag: 'v1.2.3' }
]
it.each(checks)('refuses user checks before opening selectors or feeds (%j)', async (options) => {
  const updater = await loadUpdaterModule()
  updater.setupAutoUpdater(null)
  updater.checkForUpdatesFromMenu(options)
  expect(updater.getUpdateStatus()).toMatchObject({
    state: 'error',
    message: expect.stringContaining('Orca 34 uses manual updates'),
    retryable: false,
    userInitiated: true
  })
  expect(chooseLocalBuildMock).not.toHaveBeenCalled()
  expect(loadElectronAutoUpdater).not.toHaveBeenCalled()
})

it('refuses download/install and release enumeration even before setup', async () => {
  const updater = await loadUpdaterModule()
  updater.downloadUpdate()
  updater.quitAndInstall()
  await expect(updater.listAvailableReleaseBuilds('stable')).rejects.toThrow('manual updates')
  await expect(updater.getLinuxPackageInstallInstructions()).rejects.toThrow('manual updates')
  await updater.showLinuxPackage()
  expect(updater.getUpdateStatus()).toMatchObject({ state: 'error', retryable: false })
  expect(loadElectronAutoUpdater).not.toHaveBeenCalled()
  expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
  expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
  expect(appMock.quit).not.toHaveBeenCalled()
})

it('advertises manual-only installation to older remote clients and refuses all remote triggers', async () => {
  const updater = await loadUpdaterModule()
  updater.setupAutoUpdater(null, { installMode: 'supervised-headless-serve' })
  expect(updater.getRemoteServerUpdateSupport()).toEqual({
    installMode: 'supervised-headless-serve',
    automatic: false,
    reason: 'manual-service-update-required'
  })
  expect(() => updater.checkForRemoteServerUpdate('runtime')).toThrow(
    'remote_update_manual_required'
  )
  expect(() => updater.downloadRemoteServerUpdate('runtime')).toThrow(
    'remote_update_manual_required'
  )
  expect(() => updater.installRemoteServerUpdate('runtime')).toThrow(
    'remote_update_manual_required'
  )
  expect(loadElectronAutoUpdater).not.toHaveBeenCalled()
})
