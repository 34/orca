import type { Store } from '../persistence'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { RuntimeRepositoryCommandSurface } from '../runtime/runtime-repository-command-surface'
import type { OrcaRuntimeWithCreateManagedWorktree } from '../runtime/workspaces/workspace-creation'
import type { OrcaRuntimeWithRemoveManagedWorktree } from '../runtime/workspaces/workspace-removal'
import type { recoverMultiRepoMembers } from './multi-repo-workspace-recovery'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import type { launchMultiRepoRootAgent } from './multi-repo-workspace-agent'

type Runtime = Pick<
  RuntimeRepositoryCommandSurface,
  'createFolderWorkspace' | 'listFolderWorkspaces' | 'deleteFolderWorkspace' | 'listProjectGroups'
> &
  Pick<OrcaRuntimeWithCreateManagedWorktree, 'createManagedWorktree'> &
  Pick<OrcaRuntimeService, 'waitForSetupTerminalCompletion' | 'acquireFileWatcherRemoval'> &
  Pick<OrcaRuntimeWithRemoveManagedWorktree, 'removeManagedWorktree'>
export type MultiRepoWorkspaceServiceDependencies = {
  store: Parameters<typeof recoverMultiRepoMembers>[0]['store'] &
    Pick<Store, 'flushPendingOrThrowAsync'>
  journal: MultiRepoWorkspaceStore
  runtime: Runtime
  profileId: string
  installRootSkills: (task: MultiRepoTask) => Promise<void>
  removeRootSkills: (task: MultiRepoTask) => Promise<void>
  getProjectGroupId: () => Promise<string>
  prepareSetupRetry: (
    task: MultiRepoTask,
    repoId: string,
    token: string
  ) => Promise<() => Promise<string>>
  stopRootForCleanup: (task: MultiRepoTask) => Promise<void>
  resolveRootAgentArguments?: (task: MultiRepoTask) => Promise<string | undefined>
  launchRootAgent: (
    task: MultiRepoTask,
    replay: boolean
  ) => ReturnType<typeof launchMultiRepoRootAgent>
}
