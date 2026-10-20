import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

it.skipIf(process.platform === 'win32').each([0, 7])(
  'keeps the CI canary until smoke exit %s and preserves its result',
  (exitCode) => {
    const root = mkdtempSync(join(tmpdir(), 'orca-canary-workflow-'))
    try {
      const bin = join(root, 'bin')
      mkdirSync(bin)
      const receipt = join(root, 'receipt')
      for (const [name, content] of Object.entries({
        node: 'echo fixture-base',
        git: 'exit 1',
        pnpm: `test -d "$ORCA_WATCHER_CANARY_DIR" || exit 12\nprintf '%s' "$ORCA_WATCHER_CANARY_DIR" > "$RECEIPT"\nexit ${exitCode}`
      })) {
        writeFileSync(join(bin, name), `#!/bin/sh\n${content}\n`, { mode: 0o755 })
      }
      const workflow = parse(readFileSync('.github/workflows/pr.yml', 'utf8'))
      const step = workflow.jobs.preflight.steps.find(
        (item) => item.name === 'Boot orcad and round-trip a terminal'
      )
      const script = join(root, 'step.sh')
      writeFileSync(script, step.run)
      const result = spawnSync('/bin/bash', ['-e', script], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RUNNER_TEMP: root,
          RECEIPT: receipt,
          BASE_SHA: 'fixture'
        }
      })
      expect(result.status, result.stderr).toBe(exitCode)
      const canary = readFileSync(receipt, 'utf8')
      expect(canary.length).toBeGreaterThan(0)
      expect(existsSync(canary)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)
