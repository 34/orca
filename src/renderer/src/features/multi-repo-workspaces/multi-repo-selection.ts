import type { Repo } from '../../../../shared/repo-types'
import type {
  MultiRepoCreateRequest,
  MultiRepoDefaults
} from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { multiRepoDraftNames, multiRepoMemberDirectory } from './multi-repo-draft-name'

export function selectMultiRepoMembers(
  draft: MultiRepoCreateRequest,
  repos: readonly Repo[],
  ids: ReadonlySet<string>,
  defaults: MultiRepoDefaults
): MultiRepoCreateRequest {
  const names = draft.members
    .filter((member) => ids.has(member.repoId))
    .map((member) => member.directoryName)
  const members = repos
    .filter((repo) => ids.has(repo.id))
    .map((repo) => {
      const existing = draft.members.find((member) => member.repoId === repo.id)
      const member = existing ?? {
        repoId: repo.id,
        directoryName: multiRepoMemberDirectory(repo, names),
        baseRef: repo.worktreeBaseRef || 'HEAD',
        branchName: multiRepoDraftNames(draft.name, draft.requestId, defaults).branchName,
        setupDecision: 'inherit' as const
      }
      names.push(member.directoryName)
      return member
    })
  return { ...draft, members }
}
