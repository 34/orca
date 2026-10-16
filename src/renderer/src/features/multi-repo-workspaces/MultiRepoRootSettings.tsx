import { translate } from '@/i18n/i18n'
import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/store'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { multiRepoRootEntry } from './multi-repo-root-entry'

export function MultiRepoRootSettings({
  task,
  folder,
  disabled
}: {
  task: MultiRepoTask
  folder: FolderWorkspace
  disabled: boolean
}) {
  const id = useId()
  const [name, setName] = useState(folder.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setName(folder.name), [folder.name])
  const update = async (changes: { name?: string; isArchived?: boolean }) => {
    setSaving(true)
    setError('')
    try {
      const state = useAppStore.getState()
      if (
        multiRepoRootEntry(task, state)?.id !== folder.id ||
        !(await state.updateFolderWorkspace(folder.id, changes, { executionHostId: 'local' }))
      ) {
        throw new Error(
          translate(
            'multiRepoWorkspaces.rootChanged',
            'The root entry changed; the update did not finish. Refresh or restore the entry.'
          )
        )
      }
    } catch (failure) {
      setError(String(failure))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section
      aria-label={translate('multiRepoWorkspaces.rootSettings', 'Root workspace display settings')}
      className="space-y-2 border-t border-border pt-3"
    >
      <Label htmlFor={id}>{translate('multiRepoWorkspaces.displayName', 'Display name')}</Label>
      <Input
        id={id}
        value={name}
        disabled={disabled || saving}
        maxLength={200}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={disabled || saving || !name.trim() || name.trim() === folder.name}
          onClick={() => update({ name: name.trim() })}
        >
          {translate('multiRepoWorkspaces.saveDisplayName', 'Save display name')}
        </Button>
        <Button
          variant="outline"
          disabled={disabled || saving}
          onClick={() => update({ isArchived: !folder.isArchived })}
        >
          {folder.isArchived
            ? translate('multiRepoWorkspaces.unarchive', 'Unarchive')
            : translate('multiRepoWorkspaces.archiveRoot', 'Archive root workspace')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {folder.isArchived
          ? translate('multiRepoWorkspaces.rootArchivedNotice', 'Root workspace is archived.')
          : ''}
        {translate(
          'multiRepoWorkspaces.renameArchiveNotice',
          'Renaming changes only the display name. Archiving keeps directories, branches and members, and does not stop sessions.'
        )}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
