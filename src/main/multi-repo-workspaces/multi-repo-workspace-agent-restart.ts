import type { MultiRepoWorkspaceServiceDependencies } from './multi-repo-workspace-service-contract'
import { startMultiRepoRootAgent } from './multi-repo-workspace-agent'
import { stopRegisteredMultiRepoRoot } from './multi-repo-workspace-root-removal'
import { syncMultiRepoMembershipFiles } from './multi-repo-workspace-membership'

export async function restartMultiRepoRootAgent(
  deps: Pick<
    MultiRepoWorkspaceServiceDependencies,
    'journal' | 'resolveRootAgentArguments' | 'launchRootAgent' | 'stopRootForCleanup'
  > &
    Pick<Parameters<typeof stopRegisteredMultiRepoRoot>[0], 'runtime'>,
  taskId: string,
  revision: number
) {
  let task = deps.journal.get(taskId)
  if (!task || task.revision !== revision) {
    throw new Error('Task changed; refresh before restarting the root agent')
  }
  if (
    !task.agent.selected ||
    task.root.state !== 'created' ||
    task.skillInstallation?.state === 'failed' ||
    task.members.some((member) => member.state !== 'ready' && member.state !== 'removed') ||
    (!task.agent.relaunchRequired && task.agent.state !== 'started')
  ) {
    throw new Error('Finish or recover task preparation before restarting the root agent')
  }
  const launchArgs = deps.resolveRootAgentArguments
    ? await deps.resolveRootAgentArguments(task)
    : task.context?.agentArgs
  task = await syncMultiRepoMembershipFiles(task, deps.journal)
  task = await stopRegisteredMultiRepoRoot({ ...deps, taskId })
  task.agent = { selected: task.agent.selected, state: 'pending', launchArgs }
  task = deps.journal.save(task, task.revision)
  return startMultiRepoRootAgent({
    task,
    journal: deps.journal,
    launch: deps.launchRootAgent
  })
}
