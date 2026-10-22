import { Folders } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'

export function MultiRepoWorkspaceLauncher() {
  const openModal = useAppStore((state) => state.openModal)
  if (isPairedWebClientWindow()) {
    return null
  }
  const title = translate('multiRepoWorkspaces.manageAction', 'Manage requirements')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={title}
          onClick={() => openModal('multi-repo-workspace')}
        >
          <Folders />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}
