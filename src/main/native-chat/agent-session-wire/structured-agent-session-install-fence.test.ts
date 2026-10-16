import { expect, it } from 'vitest'
import { AgentSessionPreSpawnError } from './structured-agent-session-adapter'
import { acquireWatcherRemovalGate } from '../../ipc/watcher-removal-gate'
import { createStructuredSessionInstallFence } from '../../runtime/structured-session-install-fence'
import {
  CALLER,
  attach,
  attachParams,
  hostTestState
} from './structured-agent-session-host-test-harness'

function installFence(): void {
  const { host, store } = hostTestState()
  host.deps.acquireInstallFence = createStructuredSessionInstallFence({
    store,
    resolveWorkspacePath: async () => '/task'
  })
}

it('holds root startup until the provider has acquired ownership before child removal', async () => {
  installFence()
  const { acquire } = hostTestState()
  const implementation = acquire.getMockImplementation()!
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  acquire.mockImplementation(async (...args) => {
    entered.resolve()
    await resume.promise
    return implementation(...args)
  })
  const attaching = attach()
  await entered.promise
  const gate = acquireWatcherRemovalGate('/task/api')
  try {
    expect(() => gate.abandonPendingInstalls()).toThrow('startup has not settled')
    resume.resolve()
    await attaching
    await gate.ready
  } finally {
    resume.resolve()
    await attaching
    gate.release()
  }
})

it('refuses startup during removal before calling the provider', async () => {
  installFence()
  const { host, acquire } = hostTestState()
  const gate = acquireWatcherRemovalGate('/task/api')
  try {
    await expect(host.attach(CALLER, attachParams())).rejects.toThrow(AgentSessionPreSpawnError)
    expect(acquire).not.toHaveBeenCalled()
  } finally {
    gate.release()
  }
})

it('holds failed startup until provider cleanup settles', async () => {
  installFence()
  const { acquire, releaseAcquisition, host } = hostTestState()
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<boolean>()
  acquire.mockRejectedValue(new Error('startup failed'))
  releaseAcquisition.mockImplementation(async () => {
    entered.resolve()
    return resume.promise
  })
  const attaching = host.attach(CALLER, attachParams())
  await entered.promise
  const gate = acquireWatcherRemovalGate('/task/api')
  try {
    expect(() => gate.abandonPendingInstalls()).toThrow('startup has not settled')
    resume.resolve(true)
    expect((await attaching).ok).toBe(false)
    await gate.ready
  } finally {
    resume.resolve(true)
    await attaching
    gate.release()
  }
})
