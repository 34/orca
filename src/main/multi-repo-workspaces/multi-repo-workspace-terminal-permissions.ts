import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import type { AgentStartupPlanInputs } from '../../shared/agent-startup-plan-inputs'
import { quoteStartupArg, resolveStartupShell } from '../../shared/tui-agent-startup-shell'
import { resolveMultiRepoWritableDirectories } from './multi-repo-workspace-placement'
import { supportsMultiRepoRootAgent } from '../../shared/multi-repo-workspaces/multi-repo-agent-support'

export async function withMultiRepoTerminalPermissions(
  store: ProjectRuntimeResolutionStore | null | undefined,
  workspaceId: string,
  cwd: string,
  inputs: AgentStartupPlanInputs
): Promise<AgentStartupPlanInputs> {
  if (!store || inputs.isRemote) {
    return inputs
  }
  const directories = await resolveMultiRepoWritableDirectories(store, workspaceId, cwd)
  if (directories.length === 0) {
    return inputs
  }
  if (!supportsMultiRepoRootAgent(inputs.agent)) {
    throw new Error(`Multi-repo Git permissions are not yet supported for ${inputs.agent}`)
  }
  const shell = resolveStartupShell(inputs.platform, inputs.shell)
  const grants = directories
    .flatMap((directory) => ['--add-dir', directory])
    .map((argument) => quoteStartupArg(argument, shell))
    .join(' ')
  // Prepend grants so a user's end-of-options marker cannot turn them into prompt text.
  return { ...inputs, agentArgs: `${grants}${inputs.agentArgs ? ` ${inputs.agentArgs}` : ''}` }
}
