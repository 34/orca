import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { prepareRuntimeLocalWorktreeSetup } from '../runtime/runtime-local-worktree-setup'
import { buildObservedSetupCommand } from '../runtime/orchestration/setup-completion-signal'
import { getSetupRunnerCommandPlatformForPath } from '../../shared/setup-runner-command'
import { verifyMultiRepoMemberRegistration } from './multi-repo-workspace-member-registration'
import { verifyMultiRepoRootOwnership } from './multi-repo-workspace-root-registration'

export async function prepareMultiRepoSetupRetry(
  store: Store,
  runtime: OrcaRuntimeService,
  task: MultiRepoTask,
  repoId: string,
  token: string
): Promise<() => Promise<string>> {
  const member = task.members.find((entry) => entry.repoId === repoId)
  const plan = task.plan.members.find((entry) => entry.repoId === repoId)
  const repo = store.getRepo(repoId)
  await verifyMultiRepoRootOwnership(task)
  if (!repo || !plan || !member?.instanceId) {
    throw new Error('Missing setup retry member')
  }
  const registration = await verifyMultiRepoMemberRegistration(task, repo, store, member.instanceId)
  if (!registration || registration.worktreeId !== member.worktreeId) {
    throw new Error('Setup retry member identity changed')
  }
  const { setup } = await prepareRuntimeLocalWorktreeSetup({
    request: { repoSelector: repoId, name: plan.directoryName, setupDecision: 'run' },
    repo,
    worktreePath: plan.worktreePath,
    settings: store.getSettings(),
    runtimeTarget: undefined,
    shouldUseSetupRunner: true
  })
  if (!setup) {
    throw new Error('No setup runner could be prepared; no script was launched')
  }
  const observed = buildObservedSetupCommand(
    setup.runnerScriptPath,
    getSetupRunnerCommandPlatformForPath(
      setup.runnerScriptPath,
      process.platform === 'win32' ? 'windows' : 'posix'
    ),
    token,
    setup.shell
  )
  return async () => {
    const terminal = await runtime.createTerminal(`id:${registration.worktreeId}`, {
      title: 'Setup',
      preAllocatedHandle: `term_${token}`,
      command: observed.command,
      env: { ...setup.envVars, ...observed.env },
      surfaceOwner: false
    })
    return terminal.handle
  }
}
