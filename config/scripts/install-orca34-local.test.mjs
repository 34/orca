import { expect, it } from 'vitest'
import { resolve } from 'node:path'
import { parseLocalInstallArguments } from './install-orca34-local.mjs'

it('requires explicit source, destination, profile and full expected source identity', () => {
  expect(
    parseLocalInstallArguments([
      'install',
      'candidate.app',
      'a'.repeat(40),
      'target.app',
      'profile'
    ])
  ).toEqual({
    command: 'install',
    candidate: resolve('candidate.app'),
    commit: 'a'.repeat(40),
    target: resolve('target.app'),
    profile: resolve('profile')
  })
  expect(() => parseLocalInstallArguments(['install'])).toThrow('Usage')
  expect(() =>
    parseLocalInstallArguments(['install', 'candidate.app', 'abc', 'target.app', 'profile'])
  ).toThrow('full')
  expect(() => parseLocalInstallArguments(['resume', 'transaction', 'extra'])).toThrow('Usage')
  expect(parseLocalInstallArguments(['rollback-unstarted', 'transaction'])).toEqual({
    command: 'rollback-unstarted',
    directory: resolve('transaction')
  })
})
