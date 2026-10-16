import { lazy, Suspense, useState } from 'react'
import { Folders } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const Manager = lazy(() => import('./MultiRepoWorkspaceManager'))

const CreateDialog = lazy(() => import('./MultiRepoWorkspaceCreateDialog'))

export function MultiRepoWorkspaceLauncher() {
  const [view, setView] = useState<'create' | 'manage' | null>(null)
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="新建多仓库需求工作区"
            onClick={() => setView('create')}
          >
            <Folders />
          </Button>
        </TooltipTrigger>
        <TooltipContent>新建多仓库需求工作区</TooltipContent>
      </Tooltip>
      {view && (
        <Suspense fallback={null}>
          {view === 'create' ? (
            <CreateDialog onClose={() => setView(null)} onManage={() => setView('manage')} />
          ) : (
            <Manager onClose={() => setView(null)} onCreate={() => setView('create')} />
          )}
        </Suspense>
      )}
    </>
  )
}
