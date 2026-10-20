import { expect, it } from 'vitest'
import { discoverOfficialRelease } from './orca34-upstream-discovery.mjs'

const release = {
  draft: false,
  prerelease: false,
  id: 123,
  tag_name: 'v1.4.232',
  published_at: '2026-10-20T06:20:47Z'
}
const commit = { type: 'commit', sha: 'a'.repeat(40) }

function reader(responses) {
  const calls = []
  return {
    calls,
    read: async (endpoint) => {
      calls.push(endpoint)
      if (!responses.length) {
        throw new Error('Unexpected request')
      }
      return responses.shift()
    }
  }
}

it('pins the tag commit instead of trusting a moving release target branch', async () => {
  const { read, calls } = reader([{ ...release, target_commitish: 'main' }, { object: commit }])
  expect(await discoverOfficialRelease(read)).toMatchObject({
    tag: release.tag_name,
    commit: commit.sha,
    repository: 'stablyai/orca'
  })
  expect(calls).toEqual([
    'repos/stablyai/orca/releases/latest',
    'repos/stablyai/orca/git/ref/tags/v1.4.232'
  ])
})

it.each([
  { draft: true },
  { prerelease: true },
  { tag_name: 'mobile-v1.4.232' },
  { tag_name: 'v01.4.232' },
  { tag_name: 'v99999999999999999999999.4.232' },
  { tag_name: '../main' }
])('refuses an ineligible latest release before looking up refs: %j', async (change) => {
  const { read, calls } = reader([{ ...release, ...change }])
  await expect(discoverOfficialRelease(read)).rejects.toThrow()
  expect(calls).toHaveLength(1)
})

it('peels annotated tags with a bounded request budget', async () => {
  const tag = { type: 'tag', sha: 'b'.repeat(40) }
  const { read, calls } = reader([release, { object: tag }, { object: commit }])
  expect((await discoverOfficialRelease(read)).commit).toBe(commit.sha)
  expect(calls.at(-1)).toBe(`repos/stablyai/orca/git/tags/${tag.sha}`)
  const cycle = reader([release, { object: tag }, { object: tag }])
  await expect(discoverOfficialRelease(cycle.read)).rejects.toThrow('tag chain')
  expect(cycle.calls).toHaveLength(3)
})

it.each([
  { type: 'tree', sha: commit.sha },
  { type: 'commit', sha: '--help' }
])('refuses a non-commit or invalid object identity: %j', async (object) => {
  await expect(discoverOfficialRelease(reader([release, { object }]).read)).rejects.toThrow()
})
