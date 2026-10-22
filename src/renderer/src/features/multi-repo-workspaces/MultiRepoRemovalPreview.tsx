import { translate } from '@/i18n/i18n'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { MultiRepoRemovalPreview as Preview } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-removal-preview'

export function MultiRepoRemovalPreview({ taskId }: { taskId: string }) {
  const confirm = useConfirmationDialog()
  const [stopMessage, setStopMessage] = useState('')
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <section
      className="space-y-3 border-t border-border pt-3"
      aria-label={translate('multiRepoWorkspaces.cleanupPreview', 'Cleanup preview')}
    >
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          setPreview(undefined)
          try {
            setPreview(await window.api.multiRepoWorkspaces.previewRemoval(taskId))
          } catch (failure) {
            setError(String(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy
          ? translate('multiRepoWorkspaces.checking', 'Checking…')
          : translate('multiRepoWorkspaces.checkCleanup', 'Preview cleanup')}
      </Button>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          const accepted = await confirm({
            title: translate('multiRepoWorkspaces.stopRootTitle', 'Stop root workspace sessions?'),
            description: translate(
              'multiRepoWorkspaces.stopRootDescription',
              "This closes the task root's terminals and native chats. Running work will be interrupted; files and branches will remain."
            ),
            confirmLabel: translate('multiRepoWorkspaces.stopRoot', 'Stop root sessions'),
            cancelLabel: translate('multiRepoWorkspaces.cancel', 'Cancel'),
            confirmVariant: 'destructive'
          })
          if (!accepted) {
            return
          }
          setBusy(true)
          setError('')
          setStopMessage('')
          try {
            await window.api.multiRepoWorkspaces.stopRootForCleanup(taskId)
            setStopMessage(
              translate(
                'multiRepoWorkspaces.rootStopped',
                'Root session stop checks passed. Sessions opened later must be checked again during cleanup.'
              )
            )
          } catch (failure) {
            setError(String(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        {translate('multiRepoWorkspaces.stopRoot', 'Stop root sessions')}
      </Button>
      {stopMessage && (
        <p role="status" className="text-sm">
          {stopMessage}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {preview && (
        <div className="space-y-3 text-sm">
          <p>
            {translate(
              'multiRepoWorkspaces.cleanupNotice',
              "Preview does not delete files. Member cleanup stops root sessions and that member's services, preserving branches. Uncommitted, untracked or ignored files block cleanup."
            )}
          </p>
          {preview.rootError && (
            <p role="alert" className="text-destructive">
              {preview.rootError}
            </p>
          )}
          <p>
            {translate(
              'multiRepoWorkspaces.unchangedGeneratedLabel',
              'Unchanged generated root files: '
            )}
            {preview.removableRootFiles.join('、') || translate('multiRepoWorkspaces.none', 'None')}
          </p>
          <p>
            {translate('multiRepoWorkspaces.retainedRootLabel', 'Root contents to keep: ')}
            {preview.retainedRootEntries.join('、') ||
              translate('multiRepoWorkspaces.none', 'None')}
          </p>
          {preview.members.every((member) => member.removed) && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                const accepted = await confirm({
                  title: translate(
                    'multiRepoWorkspaces.removeRootTitle',
                    'Clean up the task root and entry?'
                  ),
                  description: translate(
                    'multiRepoWorkspaces.removeRootDescription',
                    'This stops root sessions, deletes only unchanged generated files and the empty root directory, then removes the sidebar entry. Modified files, notes and other content remain and block cleanup. All member branches are kept.'
                  ),
                  confirmLabel: translate('multiRepoWorkspaces.removeRoot', 'Clean up root'),
                  cancelLabel: translate('multiRepoWorkspaces.cancel', 'Cancel'),
                  confirmVariant: 'destructive'
                })
                if (!accepted) {
                  return
                }
                setBusy(true)
                setError('')
                try {
                  const result = await window.api.multiRepoWorkspaces.removeRoot({
                    taskId,
                    revision: preview.revision
                  })
                  if (result.root.state !== 'removed') {
                    throw new Error(
                      result.root.error ??
                        translate(
                          'multiRepoWorkspaces.rootCleanupIncomplete',
                          'Root cleanup is incomplete'
                        )
                    )
                  }
                  setStopMessage(
                    translate(
                      'multiRepoWorkspaces.rootCleaned',
                      'Root directory and entry removed. Member branches are kept.'
                    )
                  )
                  setPreview(undefined)
                } catch (failure) {
                  setError(String(failure))
                  setPreview(undefined)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {translate('multiRepoWorkspaces.removeRootAndEntry', 'Clean up root and entry')}
            </Button>
          )}
          {preview.members.map((member) => (
            <div key={member.repoId} className="space-y-1">
              <p className="break-all font-mono text-xs">{member.path}</p>
              <p>
                {translate('multiRepoWorkspaces.retainedBranchLabel', 'Keep branch: ')}
                {member.branch}
              </p>
              {member.removed ? (
                <p>{translate('multiRepoWorkspaces.cleaned', 'Cleaned up')}</p>
              ) : (
                <Button
                  variant="destructive"
                  disabled={
                    busy ||
                    Boolean(
                      preview.rootError ||
                      member.error ||
                      member.truncated ||
                      member.changedPaths.length ||
                      member.ignoredPaths.length
                    )
                  }
                  onClick={async () => {
                    const accepted = await confirm({
                      title: translate(
                        'multiRepoWorkspaces.removeMemberTitle',
                        'Clean up this member worktree?'
                      ),
                      description: translate(
                        'multiRepoWorkspaces.removeMemberDescription',
                        '{{path}} will be deleted; branch {{branch}} will be kept. Root sessions and this member’s services will stop. Other member directories remain.',
                        { path: member.path, branch: member.branch }
                      ),
                      confirmLabel: translate(
                        'multiRepoWorkspaces.removeMember',
                        'Clean up member'
                      ),
                      cancelLabel: translate('multiRepoWorkspaces.cancel', 'Cancel'),
                      confirmVariant: 'destructive'
                    })
                    if (!accepted) {
                      return
                    }
                    setBusy(true)
                    setError('')
                    try {
                      const result = await window.api.multiRepoWorkspaces.removeMember({
                        taskId,
                        repoId: member.repoId,
                        revision: preview.revision
                      })
                      const updated = result.members.find((entry) => entry.repoId === member.repoId)
                      if (updated?.state !== 'removed') {
                        throw new Error(
                          updated?.error ??
                            translate(
                              'multiRepoWorkspaces.memberCleanupIncomplete',
                              'Member cleanup is incomplete'
                            )
                        )
                      }
                      setPreview(await window.api.multiRepoWorkspaces.previewRemoval(taskId))
                    } catch (failure) {
                      setError(String(failure))
                      setPreview(undefined)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  {translate('multiRepoWorkspaces.removeThisMember', 'Clean up this member')}
                </Button>
              )}

              {member.error ? (
                <p role="alert" className="text-destructive">
                  {member.error}
                </p>
              ) : (
                <>
                  <p>
                    {translate(
                      'multiRepoWorkspaces.uncommittedLabel',
                      'Uncommitted or untracked: '
                    )}
                    {member.changedPaths.join('、') ||
                      translate('multiRepoWorkspaces.none', 'None')}
                  </p>
                  <p>
                    {translate('multiRepoWorkspaces.ignoredLabel', 'Ignored by Git: ')}
                    {member.ignoredPaths.join('、') ||
                      translate('multiRepoWorkspaces.none', 'None')}
                  </p>
                  {member.truncated && (
                    <p className="text-destructive">
                      {translate(
                        'multiRepoWorkspaces.incompleteFileList',
                        'The file list is incomplete and cannot establish that cleanup is safe.'
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
