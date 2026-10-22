import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { acquireProfileStateRuntimeAdmission } from '../persistence/profile-state/profile-state-access'
import { acquireOrca34UpgradeLease, orca34InstallAccessRoot } from './orca34-install-access'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'orca34-install-access-')))
  roots.push(root)
  return { root, bundle: join(root, 'Orca 34.app'), profile: join(root, 'profile') }
}

it('excludes app launches and profile writers until the installation lease releases', () => {
  const { root, bundle, profile } = fixture()
  const lease = acquireOrca34UpgradeLease(bundle, profile, root)
  try {
    expect(() =>
      acquireProfileStateRuntimeAdmission(orca34InstallAccessRoot(bundle, root))
    ).toThrow()
    expect(() => acquireProfileStateRuntimeAdmission(profile)).toThrow()
    expect(() => acquireOrca34UpgradeLease(bundle, profile, root)).toThrow()
    lease.assertActive()
  } finally {
    lease.release()
  }
  acquireProfileStateRuntimeAdmission(profile).release()
  acquireProfileStateRuntimeAdmission(orca34InstallAccessRoot(bundle, root)).release()
  expect(() => lease.assertActive()).toThrow()
})

it('releases application maintenance when an existing profile writer refuses installation', () => {
  const { root, bundle, profile } = fixture()
  const writer = acquireProfileStateRuntimeAdmission(profile)
  try {
    expect(() => acquireOrca34UpgradeLease(bundle, profile, root)).toThrow()
    acquireProfileStateRuntimeAdmission(orca34InstallAccessRoot(bundle, root)).release()
  } finally {
    writer.release()
  }
})

it('refuses installation when a different profile still uses the same bundle', () => {
  const { root, bundle, profile } = fixture()
  const app = acquireProfileStateRuntimeAdmission(orca34InstallAccessRoot(bundle, root))
  try {
    expect(() => acquireOrca34UpgradeLease(bundle, profile, root)).toThrow()
  } finally {
    app.release()
  }
  acquireOrca34UpgradeLease(bundle, profile, root).release()
})

it('keeps application ownership outside the profile that recovery will replace', () => {
  const { bundle, profile } = fixture()
  expect(() => acquireOrca34UpgradeLease(bundle, profile, join(profile, 'home'))).toThrow(
    'outside the restored profile'
  )
})
