import type { MultiRepoCreateRequest } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { slugifyForWorkspaceName } from '../../../../shared/workspace-name'

export function multiRepoDraftNames(
  name: string,
  requestId: string,
  templates?: { branchTemplate: string; directoryTemplate: string }
) {
  const slug = slugifyForWorkspaceName(name)
  const suffix = `${slug ? `${slug}-` : ''}${requestId.slice(0, 8)}`
  if (templates) {
    const expand = (template: string) =>
      template.replaceAll('{name}', slug || 'task').replaceAll('{id}', requestId.slice(0, 8))
    return {
      directoryName: expand(templates.directoryTemplate),
      branchName: expand(templates.branchTemplate)
    }
  }
  return { directoryName: `request-${suffix}`, branchName: `task/${suffix}` }
}

export function renameMultiRepoDraft(
  draft: MultiRepoCreateRequest,
  name: string,
  templates?: { branchTemplate: string; directoryTemplate: string }
) {
  const previous = multiRepoDraftNames(draft.name, draft.requestId, templates)
  const next = multiRepoDraftNames(name, draft.requestId, templates)
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

export function multiRepoMemberDirectory(
  repo: { displayName: string; path: string; id: string },
  existing: string[]
): string {
  const basename =
    repo.path
      .replace(/[\\/]$/, '')
      .split(/[\\/]/)
      .at(-1) ?? repo.displayName
  const name = slugifyForWorkspaceName(basename) || `repo-${repo.id.slice(0, 8)}`
  let candidate = name
  let index = 2
  while (existing.some((entry) => entry.toLowerCase() === candidate.toLowerCase())) {
    candidate = `${name}-${index++}`
  }
  return candidate
}
