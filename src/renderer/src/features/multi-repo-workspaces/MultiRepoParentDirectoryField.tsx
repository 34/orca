import { translate } from '@/i18n/i18n'
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
      setStatus({
        busy: false,
        message: translate(
          'multiRepoWorkspaces.parentSaved',
          "Saved as this profile's parent directory."
        ),
        error: ''
      })
    } catch (error) {
      setStatus({ busy: false, message: '', error: String(error) })
    } finally {
      onBusyChange(false)
    }
  }
  return (
    <fieldset className="space-y-2" disabled={status.busy}>
      <Label htmlFor="multi-parent">
        {translate('multiRepoWorkspaces.parentDirectory', 'Local parent directory (absolute path)')}
      </Label>
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
          {translate('multiRepoWorkspaces.rememberDirectory', 'Remember this directory')}
        </Button>
        {defaultParentPath && (
          <Button type="button" variant="outline" onClick={() => void save('default')}>
            {translate('multiRepoWorkspaces.useDefaultDirectory', 'Use default directory')}
          </Button>
        )}
      </div>
      {defaultParentPath && (
        <p className="break-all text-xs text-muted-foreground">
          {translate('multiRepoWorkspaces.defaultDirectoryLabel', 'Default directory: ')}
          {defaultParentPath}
          {translate('multiRepoWorkspaces.createDefaultHint', '(created when selected)')}
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
