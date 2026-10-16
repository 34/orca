import { multiRepoDraftNames, renameMultiRepoDraft } from './multi-repo-draft-name'
import { MultiRepoParentDirectoryField } from './MultiRepoParentDirectoryField'
import { useEffect, useRef, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import RepoMultiCombobox from '@/components/ui/repo-multi-combobox'
import AgentCombobox from '@/components/agent/AgentCombobox'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { MultiRepoCreatePlanPreview } from './MultiRepoCreatePlanPreview'
import { MultiRepoWorkspaceTaskDetails } from './MultiRepoWorkspaceTaskDetails'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { isWslUncPath } from '../../../../shared/wsl-paths'
import type { Repo } from '../../../../shared/repo-types'
import type {
  MultiRepoCreateRequest,
  MultiRepoTask,
  MultiRepoWorkspacePlan
} from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { MultiRepoMemberFields } from './MultiRepoMemberFields'

export default function MultiRepoWorkspaceCreateDialog({
  onClose,
  onManage
}: {
  onClose: () => void
  onManage: () => void
}) {
  const [draft, setDraft] = useState<MultiRepoCreateRequest>(() => {
    const requestId = createBrowserUuid()
    return {
      requestId,
      name: '',
      prompt: '',
      parentPath: '',
      directoryName: multiRepoDraftNames('', requestId).directoryName,
      members: []
    }
  })
  const [parentDirectoryBusy, setParentDirectoryBusy] = useState(false)
  const [defaultParentPath, setDefaultParentPath] = useState<string>()
  const [repos, setRepos] = useState<Repo[]>([])
  const [preview, setPreview] = useState<MultiRepoWorkspacePlan>()
  const [task, setTask] = useState<MultiRepoTask>()
  const [status, setStatus] = useState({ busy: false, error: '', loaded: false })
  const submitted = useRef<MultiRepoCreateRequest | null>(null)
  useEffect(() => {
    let disposed = false
    void Promise.all([window.api.repos.list(), window.api.multiRepoWorkspaces.parentDirectory()])
      .then(([rows, directory]) => {
        if (!disposed) {
          setDefaultParentPath(directory.defaultParentPath)
          setDraft((value) => ({ ...value, parentPath: value.parentPath || directory.parentPath }))
          setRepos(
            rows.filter(
              (repo) =>
                repo.kind !== 'folder' &&
                getRepoExecutionHostId(repo) === 'local' &&
                !isWslUncPath(repo.path)
            )
          )
          setStatus((value) => ({ ...value, loaded: true }))
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setStatus({ busy: false, loaded: false, error: String(error) })
        }
      })
    return () => {
      disposed = true
    }
  }, [])
  const submit = async () => {
    if (status.busy) {
      return
    }
    setStatus((value) => ({ ...value, busy: true, error: '' }))
    try {
      if (!preview && !submitted.current) {
        setPreview(await window.api.multiRepoWorkspaces.previewCreate(draft))
        return
      }
      submitted.current ??= { ...draft, confirmedPlan: preview }
      setTask(await window.api.multiRepoWorkspaces.create(submitted.current))
    } catch (error) {
      if (submitted.current) {
        try {
          const current = await window.api.multiRepoWorkspaces.get(submitted.current.requestId)
          if (current) {
            setTask(current)
          } else {
            submitted.current = null
            setPreview(undefined)
          }
        } catch {
          /* Keep the same request after an unknown outcome. */
        }
      }
      setStatus((value) => ({ ...value, error: String(error) }))
    } finally {
      setStatus((value) => ({ ...value, busy: false }))
    }
  }
  const changeSelection = (ids: ReadonlySet<string>) =>
    setDraft((value) => ({
      ...value,
      members: repos
        .filter((repo) => ids.has(repo.id))
        .map(
          (repo) =>
            value.members.find((member) => member.repoId === repo.id) ?? {
              repoId: repo.id,
              directoryName: `repo-${repos.findIndex((entry) => entry.id === repo.id) + 1}`,
              baseRef: 'HEAD',
              branchName: multiRepoDraftNames(value.name, value.requestId).branchName,
              setupDecision: 'inherit'
            }
        )
    }))
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent>
        <div
          key={preview ? 'preview' : 'edit'}
          className="max-h-[75vh] space-y-4 overflow-y-auto scrollbar-sleek"
        >
          <DialogHeader>
            <DialogTitle>多仓库需求工作区</DialogTitle>
            <DialogDescription>
              选择本机 Git 仓库，在共同目录下创建独立工作树。关闭窗口不会取消后台创建。
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={onManage}>
            查看已有需求
          </Button>
          {status.error && (
            <p role="alert" className="text-sm text-destructive">
              {status.error}
            </p>
          )}
          {task ? (
            <MultiRepoWorkspaceTaskDetails initialTask={task} onOpen={onClose} />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              {!preview && (
                <fieldset
                  className="space-y-4"
                  disabled={status.busy || parentDirectoryBusy || Boolean(submitted.current)}
                >
                  <div className="space-y-2">
                    <Label htmlFor="multi-name">需求名称</Label>
                    <Input
                      id="multi-name"
                      required
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((value) => renameMultiRepoDraft(value, event.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="multi-prompt">任务说明</Label>
                    <Textarea
                      id="multi-prompt"
                      value={draft.prompt}
                      onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
                    />
                  </div>
                  <MultiRepoParentDirectoryField
                    value={draft.parentPath}
                    defaultParentPath={defaultParentPath}
                    onChange={(parentPath) => setDraft((value) => ({ ...value, parentPath }))}
                    onBusyChange={setParentDirectoryBusy}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="multi-directory">需求目录名</Label>
                    <Input
                      id="multi-directory"
                      required
                      value={draft.directoryName}
                      onChange={(event) =>
                        setDraft({ ...draft, directoryName: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="multi-repos">仓库（可跨项目组）</Label>
                    <RepoMultiCombobox
                      id="multi-repos"
                      emptySelectionLabel="选择仓库"
                      repos={repos}
                      selected={new Set(draft.members.map((member) => member.repoId))}
                      onChange={changeSelection}
                      onSelectAll={() => changeSelection(new Set(repos.map((repo) => repo.id)))}
                    />
                    {status.loaded && repos.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        请先添加本机 Git 仓库。SSH、WSL 和远端 runtime 暂不支持。
                      </p>
                    )}
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
                  <div className="space-y-2">
                    <Label htmlFor="multi-agent">根 Agent（可选）</Label>
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
                    返回修改
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={
                    status.busy ||
                    parentDirectoryBusy ||
                    !status.loaded ||
                    draft.members.length === 0
                  }
                >
                  {status.busy
                    ? '正在核验…'
                    : submitted.current
                      ? '核对提交结果'
                      : preview
                        ? '确认创建需求工作区'
                        : '预览创建计划'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
