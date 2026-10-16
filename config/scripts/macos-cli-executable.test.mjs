import { execFileSync } from 'node:child_process'
import {
  realpathSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  symlinkSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
it.skipIf(process.platform !== 'darwin').each(['Orca', 'Orca 34'])(
  'uses the signed bundle executable for %s through an external symlink',
  (name) => {
    const root = mkdtempSync(join(tmpdir(), 'orca-launcher-'))
    try {
      const contents = join(root, `${name}.app`, 'Contents')
      mkdirSync(join(contents, 'MacOS'), { recursive: true })
      mkdirSync(join(contents, 'Resources', 'bin'), { recursive: true })
      writeFileSync(
        join(contents, 'Info.plist'),
        `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>${name}</string></dict></plist>`
      )
      writeFileSync(
        join(contents, 'MacOS', name),
        '#!/bin/sh\nprintf "%s\\n" "$ELECTRON_RUN_AS_NODE" "$@"\n',
        { mode: 0o755 }
      )
      const launcher = join(contents, 'Resources', 'bin', 'orca')
      copyFileSync(resolve('resources/darwin/bin/orca'), launcher)
      const external = join(root, 'external-command')
      symlinkSync(launcher, external)
      const output = execFileSync('/bin/bash', [external, '--help'], { encoding: 'utf8' })
      expect(output.trim().split('\n')).toEqual([
        '1',
        join(realpathSync(contents), 'Resources', 'app.asar.unpacked', 'out', 'cli', 'index.js'),
        '--help'
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)
