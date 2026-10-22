import { describe, expect, it } from 'vitest'
import {
  multiRepoDraftNames,
  renameMultiRepoDraft,
  multiRepoMemberDirectory
} from './multi-repo-draft-name'
import type { MultiRepoCreateRequest } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { pluginPathSegmentError } from '../../../../shared/plugins/plugin-path-safety'

const requestId = 'a1234567-1234-4123-8123-123456789abc'
function draft(): MultiRepoCreateRequest {
  return {
    requestId,
    name: '',
    prompt: 'Keep this description',
    parentPath: '/tasks',
    directoryName: multiRepoDraftNames('', requestId).directoryName,
    members: ['api', 'web'].map((repoId) => ({
      repoId,
      directoryName: repoId,
      baseRef: 'HEAD',
      branchName: multiRepoDraftNames('', requestId).branchName,
      setupDecision: 'skip'
    }))
  }
}

describe('multi-repo draft names', () => {
  it('updates generated names while keeping the request identity and selections', () => {
    const initial = draft()
    const renamed = renameMultiRepoDraft(initial, 'Fix login')
    expect(renamed.directoryName).toBe('request-fix-login-a1234567')
    expect(renamed.members.map((member) => member.branchName)).toEqual([
      'task/fix-login-a1234567',
      'task/fix-login-a1234567'
    ])
    expect(renameMultiRepoDraft(renamed, '')).toEqual(initial)
    expect(renamed.requestId).toBe(initial.requestId)
    expect(renamed.prompt).toBe(initial.prompt)
    expect(initial.name).toBe('')
  })

  it('preserves custom root and per-repository branches across later name edits', () => {
    const custom = draft()
    custom.directoryName = 'my-task'
    custom.members[0].branchName = 'release/fix'
    const next = renameMultiRepoDraft(renameMultiRepoDraft(custom, 'First'), 'Second')
    expect(next.directoryName).toBe('my-task')
    expect(next.members[0].branchName).toBe('release/fix')
    expect(next.members[1].branchName).toBe('task/second-a1234567')
  })

  it.each(['../../Fix login', 'CON.txt', '.git', 'a'.repeat(200), '修复登录 🚀', ''])(
    'keeps portable bounded names for %s',
    (name) => {
      const names = multiRepoDraftNames(name, requestId)
      expect(pluginPathSegmentError(names.directoryName)).toBeNull()
      expect(names.directoryName.length).toBeLessThan(100)
      expect(names.directoryName).not.toMatch(/[/\\]/)
      expect(names.branchName).not.toContain('..')
      expect(names.branchName).toMatch(/-?a1234567$/)
      expect(names).not.toEqual(multiRepoDraftNames(name, 'b1234567-1234-4123-8123-123456789abc'))
    }
  )
})

it('uses configured naming formats and preserves manual branches when renaming', () => {
  const templates = { branchTemplate: 'feature/{name}-{id}', directoryTemplate: 'work-{name}-{id}' }
  const names = multiRepoDraftNames('Fix login', requestId, templates)
  expect(names).toEqual({
    branchName: 'feature/fix-login-a1234567',
    directoryName: 'work-fix-login-a1234567'
  })
  const value = draft()
  value.directoryName = multiRepoDraftNames('', requestId, templates).directoryName
  value.members[0].branchName = 'manual/branch'
  value.members[1].branchName = multiRepoDraftNames('', requestId, templates).branchName
  const next = renameMultiRepoDraft(value, 'Fix login', templates)
  expect(next.directoryName).toBe(names.directoryName)
  expect(next.members.map((member) => member.branchName)).toEqual([
    'manual/branch',
    names.branchName
  ])
})

it('derives portable member directories from native paths and disambiguates names', () => {
  expect(
    multiRepoMemberDirectory({ id: 'repo', displayName: 'Friendly title', path: '/code/api' }, [])
  ).toBe('api')
  expect(
    multiRepoMemberDirectory({ id: 'repo', displayName: 'Friendly title', path: 'C:\\code\\api' }, [
      'API',
      'api-2'
    ])
  ).toBe('api-3')
})
