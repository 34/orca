import { multiRepoAttachmentName as attachmentPath } from '../../../../shared/multi-repo-workspaces/multi-repo-attachment'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { GitHubMarkdownComposer } from '@/components/github/GitHubMarkdownComposer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { MultiRepoContext } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

type Attachment = MultiRepoContext['attachments'][number]
function readAttachment(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result.split(',')[1])
        : reject(new Error('Could not read attachment'))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function MultiRepoDescription({
  value,
  attachments,
  onChange,
  onBusyChange,
  disabled = false
}: {
  value: string
  attachments: Attachment[]
  onChange: (value: string, attachments: Attachment[]) => void
  onBusyChange: (busy: boolean) => void
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef({ value, attachments, onChange })
  useLayoutEffect(() => {
    latest.current = { value, attachments, onChange }
  }, [value, attachments, onChange])
  const uploading = useRef(false)
  const [error, setError] = useState('')
  const images = useMemo(
    () =>
      Object.fromEntries(
        attachments
          .filter((file) => file.mime.startsWith('image/'))
          .map((file) => [attachmentPath(file), `data:${file.mime};base64,${file.base64}`])
      ),
    [attachments]
  )
  const upload = async (files: File[]) => {
    if (disabled || uploading.current || !files.length) {
      return
    }
    uploading.current = true
    onBusyChange(true)
    setError('')
    try {
      const existingSize = latest.current.attachments.reduce(
        (size, file) => size + file.base64.length * 0.75,
        0
      )
      if (
        files.some((file) => file.size > 10 * 1024 * 1024) ||
        existingSize + files.reduce((size, file) => size + file.size, 0) > 20 * 1024 * 1024 ||
        files.length + latest.current.attachments.length > 20
      ) {
        throw new Error(
          translate(
            'multiRepoWorkspaces.attachmentLimit',
            'Up to 20 files, 10 MB per file and 20 MB total.'
          )
        )
      }
      const added = await Promise.all(
        files.map(async (file) => ({
          id: createBrowserUuid(),
          name: file.name,
          mime: file.type || 'application/octet-stream',
          base64: await readAttachment(file)
        }))
      )
      const links = added
        .map(
          (file) =>
            `${file.mime.startsWith('image/') ? '!' : ''}[${file.name.replace(/[[\]\\\n\r]/g, '_')}](${attachmentPath(file)})`
        )
        .join('\n\n')
      const current = latest.current
      current.onChange(`${current.value}\n\n${links}`.trim(), [...current.attachments, ...added])
    } catch (failure) {
      setError(String(failure))
    } finally {
      uploading.current = false
      onBusyChange(false)
      if (input.current) {
        input.current.value = ''
      }
    }
  }
  return (
    <div
      className="space-y-2"
      onPasteCapture={(event) => {
        const files = Array.from(event.clipboardData.files)
        if (files.length) {
          event.preventDefault()
          event.stopPropagation()
          void upload(files)
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
        }
      }}
      onDropCapture={(event) => {
        const files = Array.from(event.dataTransfer.files)
        if (files.length) {
          event.preventDefault()
          event.stopPropagation()
          void upload(files)
        }
      }}
    >
      <GitHubMarkdownComposer
        value={value}
        imageUrls={images}
        onChange={(text) => onChange(text, attachments)}
        placeholder={translate(
          'multiRepoWorkspaces.describeTask',
          'Describe the outcome and acceptance criteria…'
        )}
        disabled={disabled}
      />
      <Input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        aria-label={translate('multiRepoWorkspaces.uploadContext', 'Upload context files')}
        disabled={disabled}
        onChange={(event) => void upload(Array.from(event.target.files ?? []))}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {translate('multiRepoWorkspaces.uploadContext', 'Upload context files')}
      </Button>
      <p className="text-xs text-muted-foreground">
        {translate(
          'multiRepoWorkspaces.pasteContext',
          'Paste or drop images and files here. Context files are copied to the workspace for the agent.'
        )}
      </p>
      {attachments.map((file) => (
        <div key={file.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate">{file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            onClick={() => {
              const path = attachmentPath(file)
              const next = value.replace(
                new RegExp(`!?\\[[^\\]]*\\]\\(${path.replaceAll('.', '\\.')}\\)`, 'g'),
                ''
              )
              onChange(
                next,
                attachments.filter((entry) => entry.id !== file.id)
              )
            }}
          >
            {translate('multiRepoWorkspaces.removeAttachment', 'Remove attachment')}
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
