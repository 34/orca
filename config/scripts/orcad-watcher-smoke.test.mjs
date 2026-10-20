import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { smokeLoadWatcherChild } from './orcad-watcher-smoke.mjs'

const directories = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

it.each([0, 7])('owns the canary until child exit and preserves exit code %s', async (exitCode) => {
  const directory = mkdtempSync(join(tmpdir(), 'orca-watcher-smoke-test-'))
  directories.push(directory)
  const entry = join(directory, 'child.cjs')
  const receipt = join(directory, 'receipt.json')
  writeFileSync(
    entry,
    `
    const fs = require('node:fs');
    const canary = process.env.ORCA_WATCHER_CANARY_DIR;
    process.on('message', (message) => {
      if (!canary || !fs.statSync(canary).isDirectory() || canary === message.dir) process.exit(9);
      fs.writeFileSync(${JSON.stringify(receipt)}, JSON.stringify([canary, message.dir]));
      process.send({ op: 'subscribed' });
    });
    process.on('disconnect', () => {
      if (!fs.existsSync(canary)) process.exit(10);
      process.exit(${exitCode});
    });
  `
  )
  const result = await smokeLoadWatcherChild(process.execPath, entry)
  expect(result).toEqual(exitCode === 0 ? null : expect.stringContaining('exit code=7'))
  for (const path of JSON.parse(readFileSync(receipt, 'utf8'))) {
    expect(existsSync(path)).toBe(false)
  }
})
