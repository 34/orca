import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { MultiRepoWorkspaceTaskDetails } from './MultiRepoWorkspaceTaskDetails'

export default function MultiRepoWorkspaceManager({
  onClose,
  onCreate
}: {
  onClose: () => void
  onCreate: () => void
}) {
  const [tasks, setTasks] = useState<MultiRepoTask[]>([])
  const [selected, setSelected] = useState<MultiRepoTask>()
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let disposed = false
    let polling = false
    const refresh = async () => {
      if (polling) {
        return
      }
      polling = true
      try {
        const current = await window.api.multiRepoWorkspaces.list()
        if (!disposed) {
          setTasks(current)
          setLoaded(true)
          setError('')
        }
      } catch (failure) {
        if (!disposed) {
          setError(String(failure))
        }
      } finally {
        polling = false
      }
    }
    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, 1500)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])
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
            <DialogTitle>管理多仓库需求工作区</DialogTitle>
            <DialogDescription>
              当前配置中的本机需求记录。查看进度、继续创建或打开根工作区。
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <>
              <Button variant="outline" onClick={() => setSelected(undefined)}>
                返回需求列表
              </Button>
              <MultiRepoWorkspaceTaskDetails
                key={selected.taskId}
                initialTask={selected}
                onOpen={onClose}
              />
            </>
          ) : (
            <>
              <Button onClick={onCreate}>新建需求</Button>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {!loaded && !error && (
                <p role="status" className="text-sm">
                  正在读取需求…
                </p>
              )}
              {loaded && tasks.length === 0 && (
                <p className="text-sm text-muted-foreground">还没有多仓库需求。</p>
              )}
              <ul className="space-y-3">
                {tasks.map((task) => (
                  <li key={task.taskId} className="space-y-2 border-t border-border pt-3">
                    <Button variant="outline" onClick={() => setSelected(task)}>
                      {task.name}
                    </Button>
                    <p className="break-all font-mono text-xs">{task.plan.rootPath}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.members.filter((member) => member.state === 'ready').length} /{' '}
                      {task.members.length} 个成员已就绪
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
