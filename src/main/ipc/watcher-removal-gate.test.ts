import { describe, expect, it } from 'vitest'
import {
  acquireWatcherRemovalGate,
  beginAgentSessionInstall,
  beginTerminalInstall,
  beginWatcherInstall,
  TerminalRemovalInProgressError,
  WatcherRemovalInProgressError
} from './watcher-removal-gate'
import { isWorktreeRemovalFenceError } from '../../shared/worktree/removal-fence-error'

describe('watcher removal gate', () => {
  it('waits for an existing install and rejects later equivalent-path installs', async () => {
    const finishInstall = beginWatcherInstall('C:\\Repo')
    const removal = acquireWatcherRemovalGate('c:/repo/')
    let ready = false
    void removal.ready.then(() => {
      ready = true
    })

    await Promise.resolve()
    expect(ready).toBe(false)
    expect(() => beginWatcherInstall('C:/REPO')).toThrow(WatcherRemovalInProgressError)

    finishInstall()
    await removal.ready
    removal.release()

    const finishLaterInstall = beginWatcherInstall('C:/repo')
    finishLaterInstall()
  })

  it('drops abandoned install fences so a later removal is not fenced by a wedged install', async () => {
    beginWatcherInstall('/repo/nested')
    const removal = acquireWatcherRemovalGate('/repo')
    let ready = false
    void removal.ready.then(() => {
      ready = true
    })
    await Promise.resolve()
    expect(ready).toBe(false)

    removal.abandonPendingInstalls()
    await removal.ready
    removal.release()

    const retry = acquireWatcherRemovalGate('/repo')
    await retry.ready
    retry.release()
  })

  it('keeps a fresh install fenced after an unrelated install was abandoned', async () => {
    const wedged = beginWatcherInstall('/repo')
    const removal = acquireWatcherRemovalGate('/repo')
    removal.abandonPendingInstalls()
    removal.release()
    // Why: a late finishInstall from the abandoned slot must not release a newer install's fence.
    const finishFresh = beginWatcherInstall('/repo')
    wedged()

    const retry = acquireWatcherRemovalGate('/repo')
    let ready = false
    void retry.ready.then(() => {
      ready = true
    })
    await Promise.resolve()
    expect(ready).toBe(false)

    finishFresh()
    await retry.ready
    retry.release()
  })

  it('scopes identical roots to their execution host', async () => {
    const removal = acquireWatcherRemovalGate('/repo', 'ssh-a')
    await removal.ready

    const finishOtherHostInstall = beginWatcherInstall('/repo', 'ssh-b')
    expect(() => beginWatcherInstall('/repo', 'ssh-a')).toThrow(WatcherRemovalInProgressError)

    finishOtherHostInstall()
    removal.release()
  })

  it('rejects a second destructive owner across removal entry points', () => {
    const removal = acquireWatcherRemovalGate('/repo')

    expect(() => acquireWatcherRemovalGate('/repo')).toThrow(
      'Worktree deletion already in progress'
    )

    removal.release()
    const retry = acquireWatcherRemovalGate('/repo')
    retry.release()
  })

  it('waits for an existing terminal spawn and rejects later same-host spawns', async () => {
    const finishSpawn = beginTerminalInstall('/repo', 'ssh-a')
    const removal = acquireWatcherRemovalGate('/repo', 'ssh-a')
    let ready = false
    void removal.ready.then(() => {
      ready = true
    })

    await Promise.resolve()
    expect(ready).toBe(false)
    expect(() => beginTerminalInstall('/repo', 'ssh-a')).toThrow(TerminalRemovalInProgressError)

    finishSpawn()
    await removal.ready
    removal.release()
  })

  it('waits descendant installs and rejects overlapping removal roots', async () => {
    const finishSpawn = beginTerminalInstall('/repo/nested')
    const removal = acquireWatcherRemovalGate('/repo')
    let ready = false
    void removal.ready.then(() => {
      ready = true
    })

    await Promise.resolve()
    expect(ready).toBe(false)
    expect(() => beginTerminalInstall('/repo/late')).toThrow(TerminalRemovalInProgressError)
    expect(() => acquireWatcherRemovalGate('/repo/nested')).toThrow(
      'Worktree deletion already in progress'
    )

    finishSpawn()
    await removal.ready
    removal.release()
  })

  it('rejects enclosing installs while a nested root is being removed', async () => {
    const removal = acquireWatcherRemovalGate('/repo/nested')
    await removal.ready

    expect(() => beginWatcherInstall('/repo')).toThrow(WatcherRemovalInProgressError)
    expect(() => beginTerminalInstall('/repo')).toThrow(TerminalRemovalInProgressError)

    removal.release()
  })

  it('does not fence a distinct POSIX root containing a literal backslash', async () => {
    const removal = acquireWatcherRemovalGate('/srv/team\\repo')
    await removal.ready

    const finishInstall = beginWatcherInstall('/srv/team/repo')
    finishInstall()
    removal.release()
  })

  // Why: the renderer swallows this fence via isWorktreeRemovalFenceError so a
  // doomed pane never shows the raw error. That only holds if the thrown message
  // still matches the shared predicate — pin the cross-module contract here.
  it('throws fence errors the renderer recognizes as benign removal fences', async () => {
    const removal = acquireWatcherRemovalGate('/repo')
    await removal.ready

    const terminalError = (() => {
      try {
        beginTerminalInstall('/repo')
      } catch (error) {
        return error as Error
      }
      throw new Error('expected terminal install to be fenced')
    })()
    const watcherError = (() => {
      try {
        beginWatcherInstall('/repo')
      } catch (error) {
        return error as Error
      }
      throw new Error('expected watcher install to be fenced')
    })()

    expect(isWorktreeRemovalFenceError(terminalError.message)).toBe(true)
    expect(isWorktreeRemovalFenceError(watcherError.message)).toBe(true)

    removal.release()
  })
})

describe('agent session startup removal fence', () => {
  it.each([
    ['/task', '/task/api'],
    ['/task/api', '/task']
  ])('waits for startup at %s before removing %s without abandoning it', async (launch, target) => {
    const finish = beginAgentSessionInstall(launch)
    const gate = acquireWatcherRemovalGate(target)
    let ready = false
    void gate.ready.then(() => {
      ready = true
    })
    try {
      await Promise.resolve()
      expect(ready).toBe(false)
      expect(() => gate.abandonPendingInstalls()).toThrow('startup has not settled')
      expect(() => beginAgentSessionInstall(launch)).toThrow(TerminalRemovalInProgressError)
      finish()
      await gate.ready
      expect(() => gate.abandonPendingInstalls()).not.toThrow()
    } finally {
      finish()
      gate.release()
    }
    beginAgentSessionInstall(launch)()
  })

  it('does not fence sibling directories or another execution host', async () => {
    const finish = beginAgentSessionInstall('/task')
    const sibling = acquireWatcherRemovalGate('/task-other')
    const remote = acquireWatcherRemovalGate('/task', 'ssh-a')
    try {
      await Promise.all([sibling.ready, remote.ready])
      beginAgentSessionInstall('/task')()
    } finally {
      finish()
      sibling.release()
      remote.release()
    }
  })
})
