import { lazy, Suspense, useState } from 'react'
import { Folders } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const CreateDialog = lazy(() => import('./MultiRepoWorkspaceCreateDialog'))

export function MultiRepoWorkspaceLauncher() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="新建多仓库需求工作区"
            onClick={() => setOpen(true)}
          >
            <Folders />
          </Button>
        </TooltipTrigger>
        <TooltipContent>新建多仓库需求工作区</TooltipContent>
      </Tooltip>
      {open && (
        <Suspense fallback={null}>
          <CreateDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
