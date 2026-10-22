import { join } from 'node:path'
import { getBuildDistribution } from '../../shared/build-distribution'

export const CLI_COMMAND_NAME = getBuildDistribution().cliCommandName
export const REGISTERED_LINUX_COMMAND_NAME = getBuildDistribution().linuxCliCommandName
export const DEFAULT_MAC_COMMAND_PATH = join('/usr/local/bin', CLI_COMMAND_NAME)
export const DEV_COMMAND_NAME = `${CLI_COMMAND_NAME}-dev`
export const LEGACY_LINUX_COMMAND_NAME = 'orca'
export const DEV_LAUNCHER_DIR = ['cli', 'bin'] as const
export const WINDOWS_PATH_WRITE_TIMEOUT_MS = 5_000
