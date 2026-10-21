import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'

export function nextOrca34Notice(previous, notice) {
  if (previous) {
    assert(Number.isSafeInteger(previous.sequence) && previous.sequence > 0)
    assert.equal(typeof previous.kind, 'string')
    assert.equal(typeof previous.message, 'string')
  }
  if (!notice) {
    return previous ? { ...previous, active: false } : undefined
  }
  assert.equal(typeof notice.kind, 'string')
  assert.equal(typeof notice.message, 'string')
  assert(notice.context === undefined || typeof notice.context === 'string')
  if (
    previous?.kind === notice.kind &&
    previous.message === notice.message &&
    previous.context === notice.context
  ) {
    return { ...previous, active: true }
  }
  assert((previous?.sequence ?? 0) < Number.MAX_SAFE_INTEGER, 'Notice sequence exhausted')
  return {
    ...notice,
    sequence: (previous?.sequence ?? 0) + 1,
    active: true,
    recordedAt: new Date().toISOString()
  }
}

// Acknowledgement follows delivery; a crash between them may repeat a notice but cannot lose it.
export async function readOrca34ReleaseNotice(directory, acknowledge) {
  directory = resolve(directory)
  if (acknowledge !== undefined) {
    assert(Number.isSafeInteger(acknowledge) && acknowledge > 0)
  }
  return withUpstreamReleaseLease(join(directory, 'automation'), async (_root, lease) => {
    const state = JSON.parse(await readFile(join(directory, 'release-run.json'), 'utf8'))
    assert.equal(state.schemaVersion, 1)
    assert.equal(state.directory, directory)
    const notice = state.notification
    if (notice) {
      nextOrca34Notice(notice, null)
    }
    const path = join(directory, 'notice-delivery.json')
    let delivered = { schemaVersion: 1, sequence: 0 }
    try {
      delivered = JSON.parse(await readFile(path, 'utf8'))
      assert.equal(delivered.schemaVersion, 1)
      assert(Number.isSafeInteger(delivered.sequence) && delivered.sequence >= 0)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    assert(delivered.sequence <= (notice?.sequence ?? 0), 'Notice history moved backwards')
    if (acknowledge !== undefined) {
      assert.equal(notice?.sequence, acknowledge, 'Notice changed before acknowledgement')
      assert.equal(notice.active, true, 'Notice is no longer active')
      lease.assertActive()
      await writeInstallReceipt(path, { schemaVersion: 1, sequence: acknowledge })
      delivered.sequence = acknowledge
    }
    return {
      pending: Boolean(notice?.active && notice.sequence > delivered.sequence),
      notice: notice?.active ? notice : null,
      deliveredSequence: delivered.sequence
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, mode, sequence, ...extra] = process.argv.slice(2)
  if (
    !directory ||
    extra.length ||
    (mode && (mode !== '--ack' || !sequence)) ||
    (!mode && sequence)
  ) {
    console.error('Usage: orca34-release-notice <state-directory> [--ack <sequence>]')
    process.exitCode = 1
  } else {
    readOrca34ReleaseNotice(directory, sequence ? Number(sequence) : undefined).then(
      (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
      (error) => {
        console.error(error.message)
        process.exitCode = 1
      }
    )
  }
}
