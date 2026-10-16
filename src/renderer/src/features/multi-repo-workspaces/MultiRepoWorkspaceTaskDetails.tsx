import { MultiRepoRemovalPreview } from './MultiRepoRemovalPreview'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { activateAndRevealFolderWorkspace } from '@/lib/worktree-activation'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

const phaseLabels = {
  planned: '等待创建',
  creating: '正在创建',
  created: '已创建',
  registered: '已登记',
  ready: '已就绪',
  'needs-attention': '需要处理',
  removing: '正在清理',
  removed: '已移除',
  pending: '等待处理',
  running: '正在运行',
  succeeded: '已成功',
  failed: '失败',
  skipped: '已跳过',
  starting: '正在启动',
  started: '已启动'
} as const

export function MultiRepoWorkspaceTaskDetails({
  initialTask,
  onOpen
}: {
  initialTask: MultiRepoTask
  onOpen: () => void
}) {
  const [task, setTask] = useState(initialTask)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let disposed = false
    let polling = false
    const poll = async () => {
      if (polling) {
        return
      }
      polling = true
      try {
        const current = await window.api.multiRepoWorkspaces.get(initialTask.taskId)
        if (!disposed) {
          setMissing(!current)
          if (current) {
            setTask((previous) => (current.revision >= previous.revision ? current : previous))
          }
        }
      } catch (failure) {
        if (!disposed) {
          setError(String(failure))
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
  }, [initialTask.taskId])
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{task.name}</p>
      <p className="break-all font-mono text-xs">{task.plan.rootPath}</p>
      {task.prompt && <p className="whitespace-pre-wrap text-sm">{task.prompt}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {missing && (
        <p role="alert" className="text-sm text-destructive">
          当前配置中已找不到此需求记录，请返回列表刷新。
        </p>
      )}
      <p className="text-sm">根目录：{phaseLabels[task.root.state]}</p>
      {task.root.error && (
        <p role="alert" className="text-sm text-destructive">
          {task.root.error}
        </p>
      )}
      {task.members.map((member, index) => (
        <div key={member.repoId} className="space-y-1 border-t border-border pt-2">
          <p className="text-sm">
            {task.plan.members[index].directoryName}：{phaseLabels[member.state]} · setup{' '}
            {phaseLabels[member.setup]}
          </p>
          <p className="break-all font-mono text-xs">
            {task.plan.members[index].baseRef} → {task.plan.members[index].branchName}
          </p>
          {member.error && (
            <p role="alert" className="text-sm text-destructive">
              {member.error}
            </p>
          )}
        </div>
      ))}
      <p className="text-sm">
        根 Agent：
        {task.agent.selected
          ? `${task.agent.selected} · ${phaseLabels[task.agent.state]}`
          : '未选择'}
      </p>
      {task.agent.error && (
        <p role="alert" className="text-sm text-destructive">
          {task.agent.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          disabled={busy || missing || task.root.state === 'removed'}
          variant="outline"
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              const current = await window.api.multiRepoWorkspaces.continue(task.taskId)
              setTask((previous) => (current.revision >= previous.revision ? current : previous))
            } catch (failure) {
              setError(String(failure))
            } finally {
              setBusy(false)
            }
          }}
        >
          继续 / 重试
        </Button>
        <Button
          disabled={missing || task.root.state === 'removed' || !task.root.folderWorkspaceId}
          onClick={() => {
            if (
              task.root.folderWorkspaceId &&
              activateAndRevealFolderWorkspace(task.root.folderWorkspaceId, {
                executionHostId: 'local'
              })
            ) {
              onOpen()
            } else {
              setError('根工作区入口不可用，请检查它是否已被移除。')
            }
          }}
        >
          打开根工作区
        </Button>
      </div>
      {task.root.state !== 'removed' && <MultiRepoRemovalPreview taskId={task.taskId} />}
    </div>
  )
}
