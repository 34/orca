import { createBrowserUuid } from '@/lib/browser-uuid'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import RepoMultiCombobox from '@/components/ui/repo-multi-combobox'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { isWslUncPath } from '../../../../shared/wsl-paths'
import type { Repo } from '../../../../shared/repo-types'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { multiRepoDraftNames, multiRepoMemberDirectory } from './multi-repo-draft-name'

export function MultiRepoAddRepositories({
  task,
  onChange
}: {
  task: MultiRepoTask
  onChange: (task: MultiRepoTask) => void
}) {
  const [repos, setRepos] = useState<Repo[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const confirm = useConfirmationDialog()
  useEffect(() => {
    let disposed = false
    void window.api.repos
      .list()
      .then((rows) => {
        if (!disposed) {
          setRepos(
            rows.filter(
              (repo) =>
                repo.kind !== 'folder' &&
                getRepoExecutionHostId(repo) === 'local' &&
                !isWslUncPath(repo.path)
            )
          )
        }
      })
      .catch((failure: unknown) => {
        if (!disposed) {
          setError(String(failure))
        }
      })
    return () => {
      disposed = true
    }
  }, [])
  const available = repos.filter(
    (repo) =>
      !task.members.some((member) => member.repoId === repo.id && member.state !== 'removed')
  )
  return (
    <details className="space-y-3 border-t border-border pt-3">
      <summary className="cursor-pointer text-sm font-medium">
        {translate('multiRepoWorkspaces.addRepositories', 'Add repositories')}
      </summary>
      <RepoMultiCombobox
        repos={available}
        selected={selected}
        onChange={setSelected}
        onSelectAll={() => setSelected(new Set(available.map((repo) => repo.id)))}
        emptySelectionLabel={translate(
          'multiRepoWorkspaces.selectRepositories',
          'Select repositories'
        )}
      />
      <p className="text-xs text-muted-foreground">
        {translate(
          'multiRepoWorkspaces.changeMembersHint',
          'Adding repositories stops root sessions so the next agent can receive updated Git permissions. Existing branches and files remain. Removed repositories keep their historical record.'
        )}
      </p>
      <Button
        variant="outline"
        disabled={
          busy ||
          !selected.size ||
          task.root.state !== 'created' ||
          task.members.some((member) => member.state !== 'ready' && member.state !== 'removed')
        }
        onClick={async () => {
          if (
            !(await confirm({
              title: translate('multiRepoWorkspaces.addRepositories', 'Add repositories'),
              description: translate(
                'multiRepoWorkspaces.changeMembersHint',
                'Adding repositories stops root sessions so the next agent can receive updated Git permissions. Existing branches and files remain. Removed repositories keep their historical record.'
              ),
              confirmLabel: translate('multiRepoWorkspaces.addRepositories', 'Add repositories'),
              cancelLabel: translate('multiRepoWorkspaces.cancel', 'Cancel')
            }))
          ) {
            return
          }
          setBusy(true)
          setError('')
          try {
            const defaults = await window.api.multiRepoWorkspaces.defaults()
            const names = task.plan.members
              .filter(
                (plan) =>
                  !selected.has(plan.repoId) ||
                  task.members.find((member) => member.repoId === plan.repoId)?.state !== 'removed'
              )
              .map((member) => member.directoryName)
            const branchName = multiRepoDraftNames(
              task.name,
              createBrowserUuid(),
              defaults
            ).branchName
            const members = available
              .filter((repo) => selected.has(repo.id))
              .map((repo) => {
                const directoryName = multiRepoMemberDirectory(repo, names)
                names.push(directoryName)
                return {
                  repoId: repo.id,
                  directoryName,
                  baseRef: repo.worktreeBaseRef || 'HEAD',
                  branchName,
                  setupDecision: 'inherit' as const
                }
              })
            onChange(
              await window.api.multiRepoWorkspaces.addMembers({
                taskId: task.taskId,
                revision: task.revision,
                members
              })
            )
            setSelected(new Set())
          } catch (failure) {
            setError(String(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        {translate('multiRepoWorkspaces.addRepositories', 'Add repositories')}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </details>
  )
}
