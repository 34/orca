import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export function MultiRepoRestartAgent({
  task,
  disabled,
  onUpdated
}: {
  task: MultiRepoTask
  disabled: boolean
  onUpdated: (task: MultiRepoTask) => void
}) {
  const confirm = useConfirmationDialog()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!task.agent.selected || (!task.agent.relaunchRequired && task.agent.state !== 'started')) {
    return null
  }
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={disabled || busy}
        onClick={async () => {
          const accepted = await confirm({
            title: translate('multiRepoWorkspaces.restartAgent', 'Restart root agent'),
            description: translate(
              'multiRepoWorkspaces.restartAgentDescription',
              'Stop all sessions in this root workspace, then start a new agent conversation with the current repositories and saved task settings. Member workspace sessions and files are kept.'
            ),
            confirmLabel: translate('multiRepoWorkspaces.restartAgent', 'Restart root agent'),
            cancelLabel: translate('multiRepoWorkspaces.cancel', 'Cancel')
          })
          if (!accepted) {
            return
          }
          setBusy(true)
          setError('')
          try {
            onUpdated(
              await window.api.multiRepoWorkspaces.restartAgent({
                taskId: task.taskId,
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
        {translate('multiRepoWorkspaces.restartAgent', 'Restart root agent')}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
