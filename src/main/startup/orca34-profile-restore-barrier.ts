import { lstatSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bestEffortFsyncDirectorySync, fsyncFileSync } from '../../shared/secure-file'

function markerPath(profile: string): string {
  return join(profile, '.profile-state-access', 'maintenance', 'orca34-install-recovery.json')
}

export function hasOrca34RestoreBarrier(
  profile: string,
  target: string,
  directory: string
): boolean {
  const path = markerPath(profile)
  try {
    if (!lstatSync(path).isFile()) {
      throw new Error('Profile restore barrier is not a regular file')
    }
    const marker: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (
      typeof marker !== 'object' ||
      marker === null ||
      !('schemaVersion' in marker) ||
      marker.schemaVersion !== 1 ||
      !('profile' in marker) ||
      marker.profile !== profile ||
      !('target' in marker) ||
      marker.target !== target ||
      !('directory' in marker) ||
      marker.directory !== directory
    ) {
      throw new Error('Profile restore barrier belongs to a different installation')
    }
    return true
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export function publishOrca34RestoreBarrier(
  profile: string,
  target: string,
  directory: string
): void {
  if (hasOrca34RestoreBarrier(profile, target, directory)) {
    return
  }
  const path = markerPath(profile)
  // Older admission readers also refuse unknown entries here, retaining the fence after a crash.
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, profile, target, directory }), {
    flag: 'wx',
    mode: 0o600
  })
  fsyncFileSync(path)
  bestEffortFsyncDirectorySync(join(profile, '.profile-state-access', 'maintenance'))
}

export function removeOrca34RestoreBarrier(
  profile: string,
  target: string,
  directory: string
): void {
  if (!hasOrca34RestoreBarrier(profile, target, directory)) {
    throw new Error('Profile restore barrier is missing')
  }
  unlinkSync(markerPath(profile))
  bestEffortFsyncDirectorySync(join(profile, '.profile-state-access', 'maintenance'))
}
