import assert from 'node:assert/strict'

export function createSyncGit(source, lease, run) {
  const git = async (args, allowed = [0]) => {
    lease.assertActive()
    let terminated = false
    const result = await run({
      program: 'git',
      args,
      cwd: source,
      timeoutMs: 120_000,
      maxOutputBytes: 2 * 1024 * 1024,
      terminationBarrier: true,
      env: {
        ...process.env,
        ORCA_BACKGROUND_LAUNCH: '1',
        ORCA_SKIP_DEV_CLI_INSTALL: '1',
        GIT_TERMINAL_PROMPT: '0'
      },
      onChildTerminated: () => {
        terminated = true
      }
    })
    assert(terminated, 'Git child exit is unverifiable')
    assert(!result.timedOut && !result.outputTruncated, 'Git command did not finish completely')
    assert(allowed.includes(result.code), `Git ${args[0]} failed: ${result.stderr.slice(0, 500)}`)
    return result
  }
  const text = async (args) => (await git(args)).stdout.trim()
  return { git, text }
}
