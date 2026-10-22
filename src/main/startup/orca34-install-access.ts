import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { getBuildDistribution } from '../../shared/build-distribution'
import {
  acquireProfileStateMaintenance,
  acquireProfileStateRuntimeAdmission
} from '../persistence/profile-state/profile-state-access'
import {
  hasOrca34RestoreBarrier,
  publishOrca34RestoreBarrier,
  removeOrca34RestoreBarrier
} from './orca34-profile-restore-barrier'

export function orca34InstallAccessRoot(bundlePath: string, home = homedir()): string {
  const canonical = join(realpathSync(dirname(bundlePath)), basename(bundlePath))
  const key = createHash('sha256').update(canonical).digest('hex')
  return join(home, '.orca34', 'installations', key)
}

export function acquireOrca34UpgradeLease(
  bundlePath: string,
  userDataPath: string,
  home = homedir(),
  recoveryDirectory?: string
) {
  const accessRoot = orca34InstallAccessRoot(bundlePath, home)
  const relativeRoot = relative(userDataPath, accessRoot)
  if (
    !relativeRoot ||
    (!relativeRoot.startsWith(`..${sep}`) && relativeRoot !== '..' && !isAbsolute(relativeRoot))
  ) {
    throw new Error('Installer HOME must keep its application lease outside the restored profile')
  }
  const application = acquireProfileStateMaintenance(accessRoot)
  try {
    const recovering =
      recoveryDirectory !== undefined &&
      hasOrca34RestoreBarrier(userDataPath, bundlePath, recoveryDirectory)
    const profile = recovering ? undefined : acquireProfileStateMaintenance(userDataPath)
    return {
      assertActive(): void {
        application.assertActive()
        profile?.assertActive()
        if (recovering && !hasOrca34RestoreBarrier(userDataPath, bundlePath, recoveryDirectory)) {
          throw new Error('Profile restore barrier was lost')
        }
      },
      protectRestore(directory: string): void {
        this.assertActive()
        publishOrca34RestoreBarrier(userDataPath, bundlePath, directory)
      },
      finishRestore(directory: string): void {
        this.assertActive()
        removeOrca34RestoreBarrier(userDataPath, bundlePath, directory)
      },
      release(): void {
        try {
          profile?.release()
        } finally {
          application.release()
        }
      }
    }
  } catch (error) {
    application.release()
    throw error
  }
}

export function admitOrca34PackagedLaunch(isPackaged: boolean, executable: string): void {
  if (
    !isPackaged ||
    process.platform !== 'darwin' ||
    getBuildDistribution().appId !== 'com.orca34.desktop'
  ) {
    return
  }
  const bundle = dirname(dirname(dirname(realpathSync(executable))))
  const admission = acquireProfileStateRuntimeAdmission(orca34InstallAccessRoot(bundle))
  // Retain through shutdown: releasing at window close would admit an installer before writers exit.
  process.once('exit', () => admission.release())
}
