import { MultiRepoAddRepositories } from './MultiRepoAddRepositories'
import { MultiRepoTaskContext } from './MultiRepoTaskContext'
import { translate } from '@/i18n/i18n'
import { openMultiRepoMember } from './open-multi-repo-member'
import { useAppStore } from '@/store'
import { multiRepoRootEntry } from './multi-repo-root-entry'
import { MultiRepoRootSettings } from './MultiRepoRootSettings'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { MultiRepoRemovalPreview } from './MultiRepoRemovalPreview'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { activateAndRevealFolderWorkspace } from '@/lib/worktree-activation'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

function getPhaseLabels() {
  return {
    planned: translate('multiRepoWorkspaces.phasePlanned', 'Waiting to create'),
    creating: translate('multiRepoWorkspaces.phaseCreating', 'Creating'),
    created: translate('multiRepoWorkspaces.phaseCreated', 'Created'),
    registered: translate('multiRepoWorkspaces.phaseRegistered', 'Registered'),
    ready: translate('multiRepoWorkspaces.phaseReady', 'Ready'),
    'needs-attention': translate('multiRepoWorkspaces.phaseNeedsAttention', 'Needs attention'),
    removing: translate('multiRepoWorkspaces.phaseRemoving', 'Cleaning up'),
    removed: translate('multiRepoWorkspaces.phaseRemoved', 'Removed'),
    pending: translate('multiRepoWorkspaces.phasePending', 'Pending'),
    running: translate('multiRepoWorkspaces.phaseRunning', 'Running'),
    succeeded: translate('multiRepoWorkspaces.phaseSucceeded', 'Succeeded'),
    failed: translate('multiRepoWorkspaces.phaseFailed', 'Failed'),
    skipped: translate('multiRepoWorkspaces.phaseSkipped', 'Skipped'),
    starting: translate('multiRepoWorkspaces.phaseStarting', 'Starting'),
    started: translate('multiRepoWorkspaces.phaseStarted', 'Started')
  } as const
}

export function MultiRepoWorkspaceTaskDetails({
  initialTask,
  openWhenReady = false,
  onOpen
}: {
  initialTask: MultiRepoTask
  openWhenReady?: boolean
  onOpen: () => void
}) {
  const phaseLabels = getPhaseLabels()
  const confirm = useConfirmationDialog()
  const [task, setTask] = useState(initialTask)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let disposed = false
    let polling = false
    const poll = async () => {
      if (polling) {
        return
      }
      polling = true
      try {
        const current = await window.api.multiRepoWorkspaces.get(initialTask.taskId)
        if (!disposed) {
          setMissing(!current)
          if (current) {
            setTask((previous) => (current.revision >= previous.revision ? current : previous))
          }
        }
      } catch (failure) {
        if (!disposed) {
          setError(String(failure))
        }
      } finally {
        polling = false
      }
    }
    void poll()
    const timer = setInterval(() => {
      void poll()
    }, 1500)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [initialTask.taskId])
  const folder = useAppStore((state) => multiRepoRootEntry(task, state))
  const attemptedOpen = useRef(false)
  const ready =
    !missing &&
    !busy &&
    !task.root.error &&
    task.members.every(
      (member) =>
        (member.state === 'ready' || member.state === 'removed') &&
        (member.state === 'removed' ||
          member.setup === 'succeeded' ||
          member.setup === 'skipped') &&
        !member.error
    ) &&
    (!task.agent.selected || task.agent.state === 'started')
  useEffect(() => {
    if (!openWhenReady || !ready || !folder || folder.isArchived || attemptedOpen.current) {
      return
    }
    attemptedOpen.current = true
    if (activateAndRevealFolderWorkspace(folder.id, { executionHostId: 'local' })) {
      onOpen()
    }
  }, [openWhenReady, ready, folder, onOpen])
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{folder?.name ?? task.name}</p>
      <p className="break-all font-mono text-xs">{task.plan.rootPath}</p>
      <MultiRepoTaskContext task={task} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {missing && (
        <p role="alert" className="text-sm text-destructive">
          {translate(
            'multiRepoWorkspaces.taskMissing',
            'This task is no longer in the current profile. Return to the list and refresh.'
          )}
        </p>
      )}
      <p className="text-sm">
        {translate('multiRepoWorkspaces.rootPathLabel', 'Root directory: ')}
        {phaseLabels[task.root.state]}
      </p>
      {task.root.error && (
        <p role="alert" className="text-sm text-destructive">
          {task.root.error}
        </p>
      )}
      {task.members.map((member, index) => (
        <div key={member.repoId} className="space-y-1 border-t border-border pt-2">
          <p className="text-sm">
            {task.plan.members[index].directoryName}：{phaseLabels[member.state]}{' '}
            {translate('multiRepoWorkspaces.setupSeparator', ' · Setup ')}{' '}
            {phaseLabels[member.setup]}
          </p>
          <p className="break-all font-mono text-xs">
            {task.plan.members[index].baseRef} → {task.plan.members[index].branchName}
          </p>
          <Button
            variant="outline"
            disabled={
              busy ||
              missing ||
              (member.state !== 'ready' && member.state !== 'registered') ||
              !member.instanceId
            }
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                await openMultiRepoMember(task, member.repoId)
                onOpen()
              } catch (failure) {
                setError(String(failure))
              } finally {
                setBusy(false)
              }
            }}
          >
            {translate('multiRepoWorkspaces.openMember', 'Open member {{name}}', {
              name: task.plan.members[index].directoryName
            })}
          </Button>
          {member.state === 'registered' &&
            member.setup === 'failed' &&
            member.preparation?.state === 'finished' &&
            member.setupTerminalHandle &&
            (['retry', 'skip'] as const).map((action) => (
              <Button
                key={action}
                variant="outline"
                disabled={busy || missing}
                onClick={async () => {
                  const accepted = await confirm({
                    title:
                      action === 'retry'
                        ? translate(
                            'multiRepoWorkspaces.retrySetupTitle',
                            'Run failed setup again?'
                          )
                        : translate(
                            'multiRepoWorkspaces.skipFailedSetupTitle',
                            'Skip failed setup?'
                          ),
                    description:
                      action === 'retry'
                        ? translate(
                            'multiRepoWorkspaces.retrySetupDescription',
                            "After confirming the original setup has exited, run the member's current setup script again. It may repeat file changes or dependency installation. This does not recreate the worktree or start the root agent."
                          )
                        : translate(
                            'multiRepoWorkspaces.skipFailedSetupDescription',
                            'Mark this member ready only after confirming the original setup has exited. Initialization may be incomplete; existing files and preparation warnings remain. Continue the task afterward to start the root agent.'
                          ),
                    confirmLabel:
                      action === 'retry'
                        ? translate('multiRepoWorkspaces.rerun', 'Run again')
                        : translate('multiRepoWorkspaces.confirmSkip', 'Confirm skip'),
                    cancelLabel: translate('multiRepoWorkspaces.cancel', 'Cancel')
                  })
                  if (!accepted) {
                    return
                  }
                  setBusy(true)
                  setError('')
                  try {
                    setTask(
                      await window.api.multiRepoWorkspaces[
                        action === 'retry' ? 'retrySetup' : 'skipSetup'
                      ]({
                        taskId: task.taskId,
                        repoId: member.repoId,
                        revision: task.revision
                      })
                    )
                  } catch (failure) {
                    setError(String(failure))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {action === 'retry'
                  ? translate('multiRepoWorkspaces.retrySetup', 'Run setup again')
                  : translate('multiRepoWorkspaces.skipFailedSetup', 'Skip failed setup')}
              </Button>
            ))}
          {member.error && (
            <p role="alert" className="text-sm text-destructive">
              {member.error}
            </p>
          )}
        </div>
      ))}
      <p className="text-sm">
        {translate('multiRepoWorkspaces.rootAgentLabel', 'Root agent: ')}
        {task.agent.selected
          ? `${task.agent.selected} · ${task.agent.relaunchRequired ? translate('multiRepoWorkspaces.manualAgentRestart', 'Start a new session') : phaseLabels[task.agent.state]}`
          : translate('multiRepoWorkspaces.notSelected', 'Not selected')}
      </p>
      {task.agent.relaunchRequired && task.agent.selected && (
        <p className="text-xs text-muted-foreground">
          {translate(
            'multiRepoWorkspaces.agentRestartRequired',
            'Membership changed. Start a new agent from the root workspace to use the updated repositories.'
          )}
        </p>
      )}
      {task.agent.error && (
        <p role="alert" className="text-sm text-destructive">
          {task.agent.error}
        </p>
      )}
      {folder && <MultiRepoRootSettings task={task} folder={folder} disabled={busy || missing} />}
      {task.root.state === 'created' && (
        <Button
          variant="outline"
          disabled={busy || missing}
          onClick={async () => {
            const accepted = await confirm({
              title: translate(
                'multiRepoWorkspaces.restoreRootTitle',
                'Restore the root workspace entry?'
              ),
              description: translate(
                'multiRepoWorkspaces.restoreRootDescription',
                'After verifying the task directory and ownership, link a matching entry or restore one in the original project group. This does not recreate member worktrees or start an agent.'
              ),
              confirmLabel: translate('multiRepoWorkspaces.restoreEntry', 'Restore entry'),
              cancelLabel: translate('multiRepoWorkspaces.cancel', 'Cancel')
            })
            if (!accepted) {
              return
            }
            setBusy(true)
            setError('')
            try {
              const current = await window.api.multiRepoWorkspaces.restoreRoot({
                taskId: task.taskId,
                revision: task.revision
              })
              setTask((previous) => (current.revision >= previous.revision ? current : previous))
            } catch (failure) {
              setError(String(failure))
            } finally {
              setBusy(false)
            }
          }}
        >
          {translate('multiRepoWorkspaces.restoreRoot', 'Restore root entry')}
        </Button>
      )}
      <div className="flex gap-2">
        <Button
          disabled={busy || missing || task.root.state === 'removed'}
          variant="outline"
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              const current = await window.api.multiRepoWorkspaces.continue(task.taskId)
              setTask((previous) => (current.revision >= previous.revision ? current : previous))
            } catch (failure) {
              setError(String(failure))
            } finally {
              setBusy(false)
            }
          }}
        >
          {translate('multiRepoWorkspaces.continueTask', 'Continue / retry')}
        </Button>
        <Button
          disabled={missing || task.root.state === 'removed' || !task.root.folderWorkspaceId}
          onClick={() => {
            if (
              task.root.folderWorkspaceId &&
              activateAndRevealFolderWorkspace(task.root.folderWorkspaceId, {
                executionHostId: 'local'
              })
            ) {
              onOpen()
            } else {
              setError(
                translate(
                  'multiRepoWorkspaces.rootUnavailable',
                  'The root workspace entry is unavailable. Check whether it was removed.'
                )
              )
            }
          }}
        >
          {translate('multiRepoWorkspaces.openRoot', 'Open root workspace')}
        </Button>
      </div>
      {task.root.state !== 'removed' && (
        <>
          <MultiRepoAddRepositories task={task} onChange={setTask} />
          <MultiRepoRemovalPreview taskId={task.taskId} />
        </>
      )}
    </div>
  )
}
