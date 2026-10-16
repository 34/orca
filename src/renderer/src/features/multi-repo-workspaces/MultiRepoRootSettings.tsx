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
        throw new Error('根入口已变化，更新未完成。请刷新或恢复入口。')
      }
    } catch (failure) {
      setError(String(failure))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section aria-label="根工作区显示设置" className="space-y-2 border-t border-border pt-3">
      <Label htmlFor={id}>显示名称</Label>
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
          保存显示名称
        </Button>
        <Button
          variant="outline"
          disabled={disabled || saving}
          onClick={() => update({ isArchived: !folder.isArchived })}
        >
          {folder.isArchived ? '取消归档' : '归档根工作区'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {folder.isArchived ? '根工作区已归档。' : ''}
        改名只更新显示名称；归档保留目录、分支和成员，不停止会话。
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
