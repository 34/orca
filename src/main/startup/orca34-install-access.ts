import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getBuildDistribution } from '../../shared/build-distribution'
import {
  acquireProfileStateMaintenance,
  acquireProfileStateRuntimeAdmission
} from '../persistence/profile-state/profile-state-access'

export function orca34InstallAccessRoot(bundlePath: string, home = homedir()): string {
  const canonical = join(realpathSync(dirname(bundlePath)), basename(bundlePath))
  const key = createHash('sha256').update(canonical).digest('hex')
  return join(home, '.orca34', 'installations', key)
}

export function acquireOrca34UpgradeLease(
  bundlePath: string,
  userDataPath: string,
  home = homedir()
) {
  const application = acquireProfileStateMaintenance(orca34InstallAccessRoot(bundlePath, home))
  try {
    const profile = acquireProfileStateMaintenance(userDataPath)
    return {
      assertActive(): void {
        application.assertActive()
        profile.assertActive()
      },
      release(): void {
        try {
          profile.release()
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
