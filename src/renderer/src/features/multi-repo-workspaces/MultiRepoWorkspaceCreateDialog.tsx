import { MultiRepoDescription } from './MultiRepoDescription'
import { emptyMultiRepoContext, MultiRepoWorkspacePresets } from './MultiRepoWorkspacePresets'
import { useMultiRepoCreation } from './use-multi-repo-creation'
import { translate } from '@/i18n/i18n'
import {
  multiRepoDraftNames,
  renameMultiRepoDraft,
  multiRepoMemberDirectory
} from './multi-repo-draft-name'
import { MultiRepoParentDirectoryField } from './MultiRepoParentDirectoryField'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import RepoMultiCombobox from '@/components/ui/repo-multi-combobox'
import AgentCombobox from '@/components/agent/AgentCombobox'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { MultiRepoCreatePlanPreview } from './MultiRepoCreatePlanPreview'
import { MultiRepoWorkspaceTaskDetails } from './MultiRepoWorkspaceTaskDetails'
import { MultiRepoMemberFields } from './MultiRepoMemberFields'

export default function MultiRepoWorkspaceCreateDialog({
  onClose,
  onManage
}: {
  onClose: () => void
  onManage: () => void
}) {
  const {
    draft,
    setDraft,
    defaults,
    setDefaults,
    defaultParentPath,
    repos,
    preview,
    setPreview,
    task,
    status,
    setStatus,
    submitted,
    submit
  } = useMultiRepoCreation()
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [parentDirectoryBusy, setParentDirectoryBusy] = useState(false)
  const changeSelection = (ids: ReadonlySet<string>) =>
    setDraft((value) => {
      const names: string[] = []
      const members = repos
        .filter((repo) => ids.has(repo.id))
        .map((repo) => {
          const existing = value.members.find((member) => member.repoId === repo.id)
          const member = existing ?? {
            repoId: repo.id,
            directoryName: multiRepoMemberDirectory(repo, names),
            baseRef: repo.worktreeBaseRef || 'HEAD',
            branchName: multiRepoDraftNames(value.name, value.requestId, defaults).branchName,
            setupDecision: 'inherit' as const
          }
          names.push(member.directoryName)
          return member
        })
      return { ...value, members }
    })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <div
          key={preview ? 'preview' : 'edit'}
          className="max-h-[75vh] space-y-4 overflow-y-auto scrollbar-sleek"
        >
          <DialogHeader>
            <DialogTitle>
              {translate('multiRepoWorkspaces.title', 'Multi-repo workspace')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'multiRepoWorkspaces.createNotice',
                'Select local Git repositories to create independent worktrees under one directory. Closing this window does not cancel creation.'
              )}
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={onManage}>
            {translate('multiRepoWorkspaces.viewTasks', 'View existing tasks')}
          </Button>
          {status.error && (
            <p role="alert" className="text-sm text-destructive">
              {status.error}
            </p>
          )}
          {task ? (
            <MultiRepoWorkspaceTaskDetails initialTask={task} openWhenReady onOpen={onClose} />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              {notice && (
                <p role="status" className="text-xs text-muted-foreground">
                  {notice}
                </p>
              )}
              {!preview && (
                <fieldset
                  className="space-y-4"
                  disabled={
                    status.busy ||
                    parentDirectoryBusy ||
                    attachmentBusy ||
                    Boolean(submitted.current)
                  }
                >
                  <div className="space-y-2">
                    <Label htmlFor="multi-name">
                      {translate('multiRepoWorkspaces.taskName', 'Task name')}
                    </Label>
                    <Input
                      id="multi-name"
                      required
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((value) =>
                          renameMultiRepoDraft(value, event.target.value, defaults)
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="multi-prompt">
                      {translate('multiRepoWorkspaces.taskPrompt', 'Task description')}
                    </Label>
                    <MultiRepoDescription
                      disabled={
                        status.busy ||
                        parentDirectoryBusy ||
                        attachmentBusy ||
                        Boolean(submitted.current)
                      }
                      value={draft.prompt}
                      attachments={draft.context?.attachments ?? []}
                      onBusyChange={setAttachmentBusy}
                      onChange={(prompt, attachments) =>
                        setDraft((value) => ({
                          ...value,
                          prompt,
                          context: { ...(value.context ?? emptyMultiRepoContext), attachments }
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="multi-repos">
                      {translate(
                        'multiRepoWorkspaces.repositories',
                        'Repositories (across project groups)'
                      )}
                    </Label>
                    <RepoMultiCombobox
                      id="multi-repos"
                      emptySelectionLabel={translate(
                        'multiRepoWorkspaces.selectRepositories',
                        'Select repositories'
                      )}
                      repos={repos}
                      selected={new Set(draft.members.map((member) => member.repoId))}
                      onChange={changeSelection}
                      onSelectAll={() => changeSelection(new Set(repos.map((repo) => repo.id)))}
                    />
                    {status.loaded && repos.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        {translate(
                          'multiRepoWorkspaces.localOnlyNotice',
                          'Add local Git repositories first. SSH, WSL and remote runtimes are not supported yet.'
                        )}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="multi-agent">
                      {translate('multiRepoWorkspaces.optionalAgent', 'Root agent (optional)')}
                    </Label>
                    <AgentCombobox
                      id="multi-agent"
                      agents={getAgentCatalog().filter(
                        (agent) => agent.id === 'codex' || agent.id === 'claude'
                      )}
                      value={draft.agent ?? null}
                      onValueChange={(agent) => setDraft({ ...draft, agent })}
                      clearSelection={{
                        cleared: !draft.agent,
                        onClear: () => setDraft({ ...draft, agent: undefined })
                      }}
                    />
                  </div>
                  <details className="space-y-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      {translate(
                        'multiRepoWorkspaces.advancedSettings',
                        'Advanced settings and workspace presets'
                      )}
                    </summary>
                    <MultiRepoParentDirectoryField
                      value={draft.parentPath}
                      defaultParentPath={defaultParentPath}
                      onChange={(parentPath) => setDraft((value) => ({ ...value, parentPath }))}
                      onBusyChange={setParentDirectoryBusy}
                    />
                    <div className="space-y-2">
                      <Label htmlFor="multi-directory">
                        {translate('multiRepoWorkspaces.taskDirectory', 'Task directory name')}
                      </Label>
                      <Input
                        id="multi-directory"
                        required
                        value={draft.directoryName}
                        onChange={(event) =>
                          setDraft({ ...draft, directoryName: event.target.value })
                        }
                      />
                    </div>
                    {draft.members.map((member) => (
                      <MultiRepoMemberFields
                        key={member.repoId}
                        member={member}
                        name={
                          repos.find((repo) => repo.id === member.repoId)?.displayName ??
                          member.repoId
                        }
                        onChange={(updated) =>
                          setDraft({
                            ...draft,
                            members: draft.members.map((entry) =>
                              entry.repoId === updated.repoId ? updated : entry
                            )
                          })
                        }
                      />
                    ))}
                    <MultiRepoWorkspacePresets
                      defaults={defaults}
                      context={draft.context ?? emptyMultiRepoContext}
                      disabled={status.busy}
                      onDefaultsChange={(next) => {
                        const previous = multiRepoDraftNames(draft.name, draft.requestId, defaults)
                        const generated = multiRepoDraftNames(draft.name, draft.requestId, next)
                        setDefaults(next)
                        setDraft((value) => ({
                          ...value,
                          directoryName:
                            value.directoryName === previous.directoryName
                              ? generated.directoryName
                              : value.directoryName,
                          members: value.members.map((member) => ({
                            ...member,
                            branchName:
                              member.branchName === previous.branchName
                                ? generated.branchName
                                : member.branchName
                          }))
                        }))
                      }}
                      onContextChange={(context) => setDraft((value) => ({ ...value, context }))}
                      onSave={async () => {
                        try {
                          await window.api.multiRepoWorkspaces.saveDefaults({
                            ...defaults,
                            agent: draft.agent,
                            rules: draft.context?.rules ?? '',
                            agentInstructions: draft.context?.agentInstructions ?? '',
                            skills: draft.context?.skills ?? [],
                            pluginNotes: draft.context?.pluginNotes ?? ''
                          })
                          setNotice(
                            translate(
                              'multiRepoWorkspaces.defaultsSaved',
                              'Defaults saved for new tasks.'
                            )
                          )
                        } catch (error) {
                          setStatus((value) => ({ ...value, error: String(error) }))
                        }
                      }}
                    />
                  </details>
                </fieldset>
              )}
              {preview && <MultiRepoCreatePlanPreview plan={preview} request={draft} />}
              <div className="flex flex-wrap gap-2">
                {preview && !submitted.current && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={status.busy}
                    onClick={() => setPreview(undefined)}
                  >
                    {translate('multiRepoWorkspaces.backToEdit', 'Back to editing')}
                  </Button>
                )}
                {!preview && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      status.busy ||
                      parentDirectoryBusy ||
                      attachmentBusy ||
                      !status.loaded ||
                      !draft.name.trim() ||
                      !draft.members.length
                    }
                    onClick={() => void submit(true)}
                  >
                    {translate('multiRepoWorkspaces.previewCreate', 'Preview creation plan')}
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={
                    status.busy ||
                    parentDirectoryBusy ||
                    attachmentBusy ||
                    !status.loaded ||
                    !draft.name.trim() ||
                    draft.members.length === 0
                  }
                >
                  {status.busy
                    ? translate('multiRepoWorkspaces.verifying', 'Verifying…')
                    : submitted.current
                      ? translate('multiRepoWorkspaces.checkSubmission', 'Check submission result')
                      : preview
                        ? translate('multiRepoWorkspaces.confirmCreate', 'Create task workspace')
                        : translate('multiRepoWorkspaces.confirmCreate', 'Create task workspace')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
