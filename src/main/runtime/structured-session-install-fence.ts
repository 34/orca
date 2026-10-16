import { isNativeLocalLocation } from '../../shared/execution-host'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { beginAgentSessionInstall } from '../ipc/watcher-removal-gate'
import {
  resolveAgentSessionLaunchDirectory,
  type AgentSessionLaunchDirectoryDeps
} from './agent-session-launch-directory'

export function createStructuredSessionInstallFence(deps: AgentSessionLaunchDirectoryDeps) {
  return async (record: AgentSessionRecord): Promise<() => void> => {
    if (!isNativeLocalLocation(record.location)) {
      throw new Error('Structured session startup belongs to another execution host')
    }
    const path = await resolveAgentSessionLaunchDirectory(deps, record)
    return beginAgentSessionInstall(path)
  }
}
