import { expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { assertInstalledRuntime, assertRetainedTasks } from './orca34-install-health.mjs'

it('rejects a different app, profile, version or revealed window', () => {
  const state = { target: resolve('Orca 34.app'), profile: resolve('profile') }
  const manifest = { version: 'candidate' }
  const runtime = {
    packaged: true,
    executable: join(state.target, 'Contents', 'MacOS', 'Orca 34'),
    userData: state.profile,
    version: 'candidate',
    windows: [{ visible: false, focused: false }]
  }
  expect(() => assertInstalledRuntime(runtime, state, manifest)).not.toThrow()
  for (const change of [
    { packaged: false },
    { executable: 'other' },
    { userData: 'other' },
    { version: 'old' },
    { windows: [] },
    { windows: [{ visible: true, focused: false }] }
  ]) {
    expect(() => assertInstalledRuntime({ ...runtime, ...change }, state, manifest)).toThrow()
  }
})

it('allows runtime revisions but rejects missing tasks and changed user context or member plans', () => {
  const task = {
    taskId: 'task',
    profileId: 'local-default',
    name: 'retained',
    prompt: 'context',
    context: { rules: 'keep' },
    plan: { rootPath: '/task', members: [{ repoId: 'repo', branchName: 'task/a' }] },
    root: { state: 'created' },
    members: [{ repoId: 'repo', state: 'ready' }],
    revision: 1
  }
  expect(() => assertRetainedTasks([task], [{ ...task, revision: 2 }])).not.toThrow()
  expect(() => assertRetainedTasks([task], [])).toThrow('Existing task')
  expect(() => assertRetainedTasks([task], [{ ...task, prompt: 'lost' }])).toThrow('Existing task')
  expect(() =>
    assertRetainedTasks([task], [{ ...task, plan: { ...task.plan, members: [] } }])
  ).toThrow('Existing task')
  expect(() => assertRetainedTasks([task], [task, task])).toThrow('duplicate')
})
