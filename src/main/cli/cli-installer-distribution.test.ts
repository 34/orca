import { mkdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPackagedMacLauncher, makeFixture } from './cli-installer-test-fixtures'

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => tmpdir(), getAppPath: () => tmpdir() }
}))
const roots: string[] = []
beforeEach(() => {
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  vi.resetModules()
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const base = await makeFixture()
  roots.push(base.root)
  const resourcesPath = await createPackagedMacLauncher(base.root)
  return {
    ...base,
    resourcesPath,
    execPath: process.execPath,
    homePath: join(base.root, 'home'),
    localAppDataPath: join(base.root, 'local'),
    processPathEnv: '',
    defaultMacCommandPath: join(base.root, 'missing', 'orca34')
  }
}

it.skipIf(process.platform === 'win32')(
  'installs and removes only the fork macOS command, ignoring the official override',
  async () => {
    const options = await fixture()
    const bin = join(options.homePath, '.local', 'bin')
    await mkdir(bin, { recursive: true })
    const official = join(bin, 'orca')
    await writeFile(official, 'official launcher')
    vi.stubEnv('ORCA_CLI_INSTALL_PATH', official)
    const { CliInstaller } = await import('./cli-installer')
    const installer = new CliInstaller({ ...options, platform: 'darwin', isPackaged: true })
    const installed = await installer.install()
    expect(installed).toMatchObject({
      commandName: 'orca34',
      commandPath: join(bin, 'orca34'),
      state: 'installed'
    })
    expect(await readlink(join(bin, 'orca34'))).toBe(join(options.resourcesPath, 'bin', 'orca'))
    expect((await installer.remove()).state).toBe('not_installed')
    expect(await readFile(official, 'utf8')).toBe('official launcher')
  }
)

it.skipIf(process.platform === 'win32')(
  'refuses to replace or remove an official bundle link occupying the fork name',
  async () => {
    const options = await fixture()
    const bin = join(options.homePath, '.local', 'bin')
    await mkdir(bin, { recursive: true })
    const target = join(options.root, 'Orca.app', 'Contents', 'Resources', 'bin', 'orca')
    await symlink(target, join(bin, 'orca34'))
    const { CliInstaller } = await import('./cli-installer')
    const installer = new CliInstaller({ ...options, platform: 'darwin', isPackaged: true })
    expect((await installer.getStatus()).state).toBe('conflict')
    await expect(installer.install()).rejects.toThrow('Refusing to replace')
    await expect(installer.remove()).rejects.toThrow('Refusing to remove')
    expect(await readlink(join(bin, 'orca34'))).toBe(target)
  }
)

it.skipIf(process.platform === 'win32')(
  'keeps Linux legacy commands and the official AppImage cache separate',
  async () => {
    const options = await fixture()
    const bin = join(options.homePath, '.local', 'bin')
    await mkdir(bin, { recursive: true })
    await writeFile(join(options.resourcesPath, 'bin', 'orca-ide'), '#!/bin/sh\n', { mode: 0o755 })
    const legacyTarget = join(options.resourcesPath, 'bin', 'orca')
    await symlink(legacyTarget, join(bin, 'orca'))
    const { CliInstaller } = await import('./cli-installer')
    const installer = new CliInstaller({
      ...options,
      platform: 'linux',
      isPackaged: true,
      appImagePath: null
    })
    expect((await installer.install()).commandPath).toBe(join(bin, 'orca34'))
    await installer.remove()
    expect(await readlink(join(bin, 'orca'))).toBe(legacyTarget)
    vi.stubEnv('XDG_CACHE_HOME', join(options.root, 'cache'))
    const { getAppImageCacheRootPath } = await import('./appimage-extracted-root')
    expect(getAppImageCacheRootPath(options.homePath)).toBe(
      join(options.root, 'cache', 'orca34', 'appimage')
    )
  }
)

it('uses a separate Windows forwarder and rejects an unrelated file', async () => {
  const options = await fixture()
  await writeFile(join(options.resourcesPath, 'bin', 'orca.exe'), 'launcher')
  const userPathWriter = vi.fn().mockResolvedValue(undefined)
  const { CliInstaller } = await import('./cli-installer')
  const installer = new CliInstaller({
    ...options,
    platform: 'win32',
    isPackaged: true,
    userPathReader: async () => ({ state: 'success', value: '', expandable: false }),
    userPathWriter
  })
  const status = await installer.getStatus()
  expect(status.commandPath).toBe(
    join(options.localAppDataPath, 'Programs', 'Orca 34', 'bin', 'orca34.cmd')
  )
  expect(status.launcherPath).toBe(join(options.resourcesPath, 'bin', 'orca.exe'))
  if (!status.commandPath) {
    throw new Error('Missing command path')
  }
  await mkdir(join(options.localAppDataPath, 'Programs', 'Orca 34', 'bin'), { recursive: true })
  await writeFile(status.commandPath, 'unrelated command')
  await expect(installer.install()).rejects.toThrow('Refusing to replace')
  await expect(installer.remove()).rejects.toThrow('Refusing to remove')
  expect(userPathWriter).not.toHaveBeenCalled()
})

it.skipIf(process.platform === 'win32')(
  'keeps the dev command separate while retaining the profile-local orca alias',
  async () => {
    const options = await fixture()
    const { CliInstaller } = await import('./cli-installer')
    const status = await new CliInstaller({
      ...options,
      platform: 'darwin',
      isPackaged: false
    }).getStatus()
    expect(status).toMatchObject({
      commandName: 'orca34-dev',
      commandPath: '/usr/local/bin/orca34-dev'
    })
    expect(status.launcherPath).toBe(join(options.userDataPath, 'cli', 'bin', 'orca34-dev'))
    expect(await readFile(join(options.userDataPath, 'cli', 'bin', 'orca'), 'utf8')).toContain(
      options.userDataPath
    )
  }
)

it('registers only the fork Windows forwarder directory and removes its PATH entry', async () => {
  const options = await fixture()
  await writeFile(join(options.resourcesPath, 'bin', 'orca.exe'), 'launcher')
  let userPath = 'C:\\OfficialOrca\\bin'
  const { CliInstaller } = await import('./cli-installer')
  const installer = new CliInstaller({
    ...options,
    platform: 'win32',
    isPackaged: true,
    userPathReader: async () => ({ state: 'success', value: userPath, expandable: false }),
    userPathWriter: async (value) => {
      userPath = value
    },
    userPathCacheInvalidator: () => {}
  })
  const installed = await installer.install()
  expect(installed.state).toBe('installed')
  expect(installed.pathConfigured).toBe(true)
  expect(userPath).toContain('C:\\OfficialOrca\\bin')
  expect(userPath).not.toContain(options.resourcesPath)
  expect((await installer.remove()).state).toBe('not_installed')
  expect(userPath).toBe('C:\\OfficialOrca\\bin')
})
