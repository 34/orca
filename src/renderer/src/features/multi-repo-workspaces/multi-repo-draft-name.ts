import type { MultiRepoCreateRequest } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { slugifyForWorkspaceName } from '../../../../shared/workspace-name'

export function multiRepoDraftNames(name: string, requestId: string) {
  const slug = slugifyForWorkspaceName(name)
  const suffix = `${slug ? `${slug}-` : ''}${requestId.slice(0, 8)}`
  return { directoryName: `request-${suffix}`, branchName: `task/${suffix}` }
}

export function renameMultiRepoDraft(draft: MultiRepoCreateRequest, name: string) {
  const previous = multiRepoDraftNames(draft.name, draft.requestId)
  const next = multiRepoDraftNames(name, draft.requestId)
  return {
    ...draft,
    name,
    directoryName:
      draft.directoryName === previous.directoryName ? next.directoryName : draft.directoryName,
    members: draft.members.map((member) => ({
      ...member,
      branchName: member.branchName === previous.branchName ? next.branchName : member.branchName
    }))
  }
}
