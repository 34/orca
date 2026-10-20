import { expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import {
  multiRepoDefaultsSchema,
  type MultiRepoCreateRequest
} from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { renameMultiRepoDraft } from './multi-repo-draft-name'
import { selectMultiRepoMembers } from './multi-repo-selection'

const defaults = multiRepoDefaultsSchema.parse({ repositoryIds: ['a', 'b', 'missing'] })
const repos: Repo[] = ['a', 'b'].map((id) => ({
  id,
  displayName: id,
  path: `/projects/${id}/api`,
  badgeColor: '',
  addedAt: 0,
  worktreeBaseRef: 'origin/main'
}))
const draft: MultiRepoCreateRequest = {
  requestId: 'a1234567-1234-4123-8123-123456789abc',
  name: '',
  prompt: '',
  parentPath: '/tasks',
  directoryName: 'request-task-a1234567',
  members: []
}

it('restores available repositories with collision-free directories and fresh branches', () => {
  const selected = selectMultiRepoMembers(draft, repos, new Set(defaults.repositoryIds), defaults)
  expect(selected.members.map((member) => member.directoryName)).toEqual(['api', 'api-2'])
  expect(selected.members.every((member) => member.baseRef === 'origin/main')).toBe(true)
  const named = renameMultiRepoDraft(selected, 'Fix login', defaults)
  expect(named.members.map((member) => member.branchName)).toEqual([
    'task/fix-login-a1234567',
    'task/fix-login-a1234567'
  ])
  const next = selectMultiRepoMembers(
    { ...draft, requestId: 'b1234567-1234-4123-8123-123456789abc' },
    repos,
    new Set(defaults.repositoryIds),
    defaults
  )
  expect(next.members[0].branchName).not.toBe(selected.members[0].branchName)
})

it('preserves edited members while changing selection and allows clearing the combination', () => {
  const selected = selectMultiRepoMembers(draft, repos, new Set(['a']), defaults)
  selected.members[0].branchName = 'manual/branch'
  selected.members[0].setupDecision = 'skip'
  const expanded = selectMultiRepoMembers(selected, repos, new Set(['a', 'b']), defaults)
  expect(expanded.members[0]).toEqual(selected.members[0])
  expect(expanded.members[1].directoryName).toBe('api-2')
  expect(selectMultiRepoMembers(expanded, repos, new Set(), defaults).members).toEqual([])
})
