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
import { joinPath } from '@/lib/path'
import { activateAndRevealFolderWorkspace } from '@/lib/worktree-activation'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { isWslUncPath } from '../../../../shared/wsl-paths'
import type { Repo } from '../../../../shared/repo-types'
import type {
  MultiRepoCreateRequest,
  MultiRepoTask
} from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { MultiRepoMemberFields } from './MultiRepoMemberFields'

export default function MultiRepoWorkspaceCreateDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<MultiRepoCreateRequest>(() => {
    const requestId = createBrowserUuid()
    return {
      requestId,
      name: '',
      prompt: '',
      parentPath: '',
      directoryName: `request-${requestId.slice(0, 8)}`,
      members: []
    }
  })
  const [repos, setRepos] = useState<Repo[]>([])
  const [task, setTask] = useState<MultiRepoTask>()
  const [status, setStatus] = useState({ busy: false, error: '', loaded: false })
  const submitted = useRef<MultiRepoCreateRequest | null>(null)
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
  const taskId = task?.taskId
  useEffect(() => {
    if (!taskId) {
      return
    }
    let disposed = false
    let polling = false
    const poll = async () => {
      if (polling) {
        return
      }
      polling = true
      try {
        const current = await window.api.multiRepoWorkspaces.get(taskId)
        if (!disposed && current) {
          setTask(current)
        }
      } catch (error) {
        if (!disposed) {
          setStatus((value) => ({ ...value, error: String(error) }))
        }
      } finally {
        polling = false
      }
    }
    void poll()
    const timer = setInterval(() => {
      void poll()
    }, 1500)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [taskId])
  const submit = async () => {
    if (status.busy) {
      return
    }
    submitted.current ??= draft
    setStatus((value) => ({ ...value, busy: true, error: '' }))
    try {
      setTask(await window.api.multiRepoWorkspaces.create(submitted.current))
    } catch (error) {
      try {
        const current = await window.api.multiRepoWorkspaces.get(submitted.current.requestId)
        if (current) {
          setTask(current)
        } else {
          submitted.current = null
        }
      } catch {
        /* Keep the same request after an unknown outcome. */
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
              branchName: `task/${value.requestId.slice(0, 8)}`,
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
        <div className="max-h-[75vh] space-y-4 overflow-y-auto scrollbar-sleek">
          <DialogHeader>
            <DialogTitle>多仓库需求工作区</DialogTitle>
            <DialogDescription>
              选择本机 Git 仓库，在共同目录下创建独立工作树。关闭窗口不会取消后台创建。
            </DialogDescription>
          </DialogHeader>
          {status.error && (
            <p role="alert" className="text-sm text-destructive">
              {status.error}
            </p>
          )}
          {task ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">{task.name}</p>
              <p className="break-all font-mono text-xs">{task.plan.rootPath}</p>
              <p className="text-sm">根目录：{task.root.state}</p>
              {task.root.error && (
                <p role="alert" className="text-sm text-destructive">
                  {task.root.error}
                </p>
              )}
              {task.members.map((member) => (
                <div key={member.repoId} className="space-y-1 border-t border-border pt-2">
                  <p className="text-sm">
                    {
                      task.plan.members.find((entry) => entry.repoId === member.repoId)
                        ?.directoryName
                    }
                    ：{member.state} · setup {member.setup}
                  </p>
                  {member.error && <p className="text-sm text-destructive">{member.error}</p>}
                </div>
              ))}
              <p className="text-sm">
                根 Agent：{task.agent.selected ? task.agent.state : '未选择'}
              </p>
              {task.agent.error && (
                <p role="alert" className="text-sm text-destructive">
                  {task.agent.error}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  disabled={status.busy}
                  variant="outline"
                  onClick={async () => {
                    setStatus((value) => ({ ...value, busy: true, error: '' }))
                    try {
                      setTask(await window.api.multiRepoWorkspaces.continue(task.taskId))
                    } catch (error) {
                      setStatus((value) => ({ ...value, error: String(error) }))
                    } finally {
                      setStatus((value) => ({ ...value, busy: false }))
                    }
                  }}
                >
                  继续 / 重试
                </Button>
                <Button
                  disabled={!task.root.folderWorkspaceId}
                  onClick={() => {
                    if (
                      task.root.folderWorkspaceId &&
                      activateAndRevealFolderWorkspace(task.root.folderWorkspaceId, {
                        executionHostId: 'local'
                      })
                    ) {
                      onClose()
                    }
                  }}
                >
                  打开根工作区
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <fieldset className="space-y-4" disabled={status.busy || Boolean(submitted.current)}>
                <div className="space-y-2">
                  <Label htmlFor="multi-name">需求名称</Label>
                  <Input
                    id="multi-name"
                    required
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
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
                <div className="space-y-2">
                  <Label htmlFor="multi-parent">本机父目录（绝对路径）</Label>
                  <Input
                    id="multi-parent"
                    required
                    value={draft.parentPath}
                    onChange={(event) => setDraft({ ...draft, parentPath: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="multi-directory">需求目录名</Label>
                  <Input
                    id="multi-directory"
                    required
                    value={draft.directoryName}
                    onChange={(event) => setDraft({ ...draft, directoryName: event.target.value })}
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
                      repos.find((repo) => repo.id === member.repoId)?.displayName ?? member.repoId
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
                <div className="space-y-1 text-xs">
                  <p>创建计划</p>
                  <p className="break-all font-mono">
                    {joinPath(draft.parentPath, draft.directoryName)}
                  </p>
                  {draft.members.map((member) => (
                    <p key={member.repoId} className="break-all font-mono">
                      {member.directoryName} · {member.baseRef} → {member.branchName}
                    </p>
                  ))}
                </div>
              </fieldset>
              <Button
                type="submit"
                disabled={status.busy || !status.loaded || draft.members.length === 0}
              >
                {status.busy ? '正在提交…' : '创建需求工作区'}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
