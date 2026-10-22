import { useMemo, useState } from 'react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import { joinPath } from '@/lib/path'
import { translate } from '@/i18n/i18n'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { multiRepoAttachmentName } from '../../../../shared/multi-repo-workspaces/multi-repo-attachment'

export function MultiRepoTaskContext({ task }: { task: MultiRepoTask }) {
  const [error, setError] = useState('')
  const attachments = task.context?.attachments
  const content = useMemo(() => {
    let markdown = task.prompt
    for (const file of attachments ?? []) {
      if (/^image\/(png|jpe?g|gif|webp)$/.test(file.mime)) {
        markdown = markdown.replaceAll(
          `](${multiRepoAttachmentName(file)})`,
          `](data:${file.mime};base64,${file.base64})`
        )
      }
    }
    return markdown
  }, [task.prompt, attachments])
  const open = async (name: string) => {
    setError('')
    try {
      await window.api.shell.openInFileManager(joinPath(task.plan.rootPath, name), 'local')
    } catch (failure) {
      setError(String(failure))
    }
  }
  return (
    <div className="space-y-2">
      {content && (
        <CommentMarkdown
          content={content}
          variant="document"
          expandImages
          onLinkClick={(event, href) => {
            if (attachments?.some((file) => multiRepoAttachmentName(file) === href)) {
              event.preventDefault()
              void open(href ?? '')
            }
          }}
        />
      )}
      {attachments?.map((file) => (
        <Button
          key={file.id}
          variant="outline"
          size="sm"
          disabled={task.root.state !== 'created'}
          onClick={() => void open(multiRepoAttachmentName(file))}
        >
          {file.name}
        </Button>
      ))}
      {task.context && (
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm">
            {translate('multiRepoWorkspaces.workspaceRules', 'Workspace AGENTS.md rules')}
          </summary>
          <p className="whitespace-pre-wrap text-xs">{task.context.rules}</p>
          <p className="whitespace-pre-wrap text-xs">{task.context.agentInstructions}</p>
          <p className="text-xs text-muted-foreground">
            {task.context.skills.map((skill) => skill.name).join('、')}
          </p>
          <p className="whitespace-pre-wrap text-xs">{task.context.pluginNotes}</p>
        </details>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
