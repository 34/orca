import { fork } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Verify the shipped native watcher actually subscribes under the bundled runtime.
export async function smokeLoadWatcherChild(runtimePath, entry) {
  const probeDir = mkdtempSync(join(tmpdir(), 'orcad-watcher-smoke-'))
  const canaryDir = join(probeDir, 'canary')
  mkdirSync(canaryDir)
  const child = fork(entry, [], {
    execPath: runtimePath,
    // Match the supervisor: the parent removes watched directories after child exit.
    env: { ...process.env, ORCA_WATCHER_CANARY_DIR: canaryDir },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    windowsHide: true
  })
  let stderr = ''
  let subscribed = false
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk)
  })
  try {
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve(`Watcher did not complete its subscription within 30s.\n${stderr.slice(0, 2000)}`)
      }, 30_000)
      const settle = (failure) => {
        clearTimeout(timer)
        resolve(failure)
      }
      child.on('message', (message) => {
        subscribed ||= message?.op === 'subscribed'
        if (message?.op === 'subscribed' || message?.op === 'subscribe-failed') {
          child.disconnect()
        }
      })
      child.on('error', (error) => settle(`fork failed: ${error.message}`))
      // Why exit and not disconnect: the child exits 0 on disconnect, so a non-zero code
      // or a signal here is a load failure rather than a clean teardown.
      child.on('exit', (code, signal) =>
        settle(
          code === 0 && subscribed
            ? null
            : `subscribed=${subscribed} exit code=${code} signal=${signal}\n${stderr.slice(0, 2000)}`
        )
      )
      child.send({ op: 'subscribe', id: 1, dir: probeDir, opts: {} })
    })
  } finally {
    const cleanup = () => rmSync(probeDir, { recursive: true, force: true })
    if (child.exitCode !== null || child.signalCode !== null) {
      cleanup()
    } else {
      child.once('close', cleanup)
    }
  }
}
