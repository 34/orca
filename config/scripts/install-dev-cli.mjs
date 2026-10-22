#!/usr/bin/env node
// Symlinks the orca-dev wrapper into /usr/local/bin so the dev CLI is
// available globally after `pnpm run build:cli`.
import { readCompiledCliDistribution } from '../build-distribution.cjs'
import { existsSync, lstatSync, readlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const scriptDir = import.meta.dirname
const source = path.join(scriptDir, 'orca-dev.mjs')

const distribution = readCompiledCliDistribution(path.resolve(scriptDir, '..', '..', 'out'))
const commandPath =
  process.platform === 'darwin' || process.platform === 'linux'
    ? path.join('/usr/local/bin', `${distribution.cliCommandName}-dev`)
    : null

if (process.env.ORCA_SKIP_DEV_CLI_INSTALL === '1') {
  console.log('[orca-dev] Skipping global symlink by request.')
  process.exit(0)
}

if (!commandPath) {
  console.log('[orca-dev] Skipping global symlink (unsupported platform).')
  process.exit(0)
}

function isOwnedByUs(target) {
  try {
    if (!lstatSync(target).isSymbolicLink()) {
      return false
    }
    return readlinkSync(target) === source
  } catch {
    return false
  }
}

if (existsSync(commandPath)) {
  if (isOwnedByUs(commandPath)) {
    console.log(`[orca-dev] ${commandPath} already points to dev CLI.`)
    process.exit(0)
  }
  console.error(
    `[orca-dev] ${commandPath} exists but is not our symlink. Remove it manually if you want the dev CLI installed globally.`
  )
  process.exit(0)
}

try {
  execFileSync('ln', ['-s', source, commandPath], { stdio: 'inherit' })
  console.log(`[orca-dev] Symlinked ${commandPath} → ${source}`)
} catch {
  console.log(
    `[orca-dev] Could not create ${commandPath} (permission denied). Run once with:\n` +
      `  sudo ln -s ${source} ${commandPath}`
  )
}
