import { activateAndRevealFolderWorkspace } from '@/lib/worktree-activation'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { multiRepoRootEntry } from './multi-repo-root-entry'
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
  const folderWorkspaces = useAppStore((state) => state.folderWorkspaces)
  const projectGroups = useAppStore((state) => state.projectGroups)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('active')
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
      <DialogContent className="sm:max-w-5xl">
        <div className="max-h-[75vh] space-y-4 overflow-y-auto scrollbar-sleek">
          <DialogHeader>
            <DialogTitle>
              {translate('multiRepoWorkspaces.manageTitle', 'Manage multi-repo workspaces')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'multiRepoWorkspaces.manageNotice',
                'Local tasks in this profile. Check progress, resume creation or open a root workspace.'
              )}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <>
              <Button variant="outline" onClick={() => setSelected(undefined)}>
                {translate('multiRepoWorkspaces.backToList', 'Back to task list')}
              </Button>
              <MultiRepoWorkspaceTaskDetails
                key={selected.taskId}
                initialTask={selected}
                onOpen={onClose}
              />
            </>
          ) : (
            <>
              <Button onClick={onCreate}>
                {translate('multiRepoWorkspaces.newTask', 'New task')}
              </Button>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={translate(
                  'multiRepoWorkspaces.searchTasks',
                  'Search tasks or repositories'
                )}
                placeholder={translate(
                  'multiRepoWorkspaces.searchTasks',
                  'Search tasks or repositories'
                )}
              />
              <Tabs value={filter} onValueChange={setFilter}>
                <TabsList>
                  <TabsTrigger value="active">
                    {translate('multiRepoWorkspaces.activeTasks', 'Active')}
                  </TabsTrigger>
                  <TabsTrigger value="attention">
                    {translate('multiRepoWorkspaces.attentionTasks', 'Needs attention')}
                  </TabsTrigger>
                  <TabsTrigger value="archived">
                    {translate('multiRepoWorkspaces.archivedTasks', 'Archived')}
                  </TabsTrigger>
                  <TabsTrigger value="all">
                    {translate('multiRepoWorkspaces.allTasks', 'All')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-xs text-muted-foreground">
                {translate('multiRepoWorkspaces.taskCount', '{{count}} tasks in this profile', {
                  count: tasks.length
                })}
              </p>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {!loaded && !error && (
                <p role="status" className="text-sm">
                  {translate('multiRepoWorkspaces.loadingTasks', 'Loading tasks…')}
                </p>
              )}
              {loaded && tasks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {translate('multiRepoWorkspaces.noTasks', 'No multi-repo tasks yet.')}
                </p>
              )}
              <ul className="space-y-3">
                {tasks
                  .filter((task) => {
                    const folder = multiRepoRootEntry(task, { folderWorkspaces, projectGroups })
                    const archived = Boolean(folder?.isArchived) || task.root.state === 'removed'
                    const attention = Boolean(
                      task.root.error ||
                      task.agent.error ||
                      task.pendingRootPlan ||
                      task.members.some(
                        (member) => member.error || member.state === 'needs-attention'
                      )
                    )
                    const matches =
                      `${folder?.name ?? task.name} ${task.prompt} ${task.plan.members.map((member) => `${member.directoryName} ${member.branchName}`).join(' ')}`
                        .toLowerCase()
                        .includes(query.toLowerCase())
                    return (
                      matches &&
                      (filter === 'all' ||
                        (filter === 'active' && !archived) ||
                        (filter === 'archived' && archived) ||
                        (filter === 'attention' && attention))
                    )
                  })
                  .toSorted((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
                  .map((task) => {
                    const folder = multiRepoRootEntry(task, { folderWorkspaces, projectGroups })
                    return (
                      <li key={task.taskId} className="space-y-2 border-t border-border pt-3">
                        <Button variant="outline" onClick={() => setSelected(task)}>
                          {folder?.name ?? task.name}
                        </Button>
                        {folder && !folder.isArchived && task.root.state === 'created' && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              if (
                                activateAndRevealFolderWorkspace(folder.id, {
                                  executionHostId: 'local'
                                })
                              ) {
                                onClose()
                              }
                            }}
                          >
                            {translate('multiRepoWorkspaces.openRoot', 'Open root workspace')}
                          </Button>
                        )}
                        {folder?.isArchived && (
                          <p className="text-xs text-muted-foreground">
                            {translate(
                              'multiRepoWorkspaces.rootArchived',
                              'Root workspace archived'
                            )}
                          </p>
                        )}
                        <p className="break-all font-mono text-xs">{task.plan.rootPath}</p>
                        <p className="text-xs text-muted-foreground">
                          {translate(
                            'multiRepoWorkspaces.membersReady',
                            '{{ready}} / {{total}} members ready',
                            {
                              ready: task.members.filter((member) => member.state === 'ready')
                                .length,
                              total: task.members.filter((member) => member.state !== 'removed')
                                .length
                            }
                          )}
                        </p>
                      </li>
                    )
                  })}
              </ul>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
