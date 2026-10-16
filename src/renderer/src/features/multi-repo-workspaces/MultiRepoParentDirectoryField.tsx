import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function MultiRepoParentDirectoryField({
  value,
  defaultParentPath,
  onChange,
  onBusyChange
}: {
  value: string
  defaultParentPath?: string
  onChange: (path: string) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [status, setStatus] = useState({ busy: false, message: '', error: '' })
  const save = async (source: 'selected' | 'default') => {
    onBusyChange(true)
    setStatus({ busy: true, message: '', error: '' })
    try {
      const path = await window.api.multiRepoWorkspaces.saveParentDirectory(
        source === 'default' ? { source } : { source, path: value }
      )
      onChange(path)
      setStatus({ busy: false, message: '已保存为当前配置的父目录。', error: '' })
    } catch (error) {
      setStatus({ busy: false, message: '', error: String(error) })
    } finally {
      onBusyChange(false)
    }
  }
  return (
    <fieldset className="space-y-2" disabled={status.busy}>
      <Label htmlFor="multi-parent">本机父目录（绝对路径）</Label>
      <Input
        id="multi-parent"
        required
        value={value}
        onChange={(event) => {
          setStatus({ busy: false, message: '', error: '' })
          onChange(event.target.value)
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!value}
          onClick={() => void save('selected')}
        >
          记住此目录
        </Button>
        {defaultParentPath && (
          <Button type="button" variant="outline" onClick={() => void save('default')}>
            使用默认目录
          </Button>
        )}
      </div>
      {defaultParentPath && (
        <p className="break-all text-xs text-muted-foreground">
          默认目录：{defaultParentPath}（点击使用时创建）
        </p>
      )}
      {status.message && (
        <p role="status" className="text-xs text-muted-foreground">
          {status.message}
        </p>
      )}
      {status.error && (
        <p role="alert" className="text-sm text-destructive">
          {status.error}
        </p>
      )}
    </fieldset>
  )
}
