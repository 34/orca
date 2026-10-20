import { lazy, Suspense, useState } from 'react'
import { useAppStore } from '@/store'

const Manager = lazy(() => import('./MultiRepoWorkspaceManager'))
const CreateDialog = lazy(() => import('./MultiRepoWorkspaceCreateDialog'))

export default function MultiRepoWorkspaceModal() {
  const [view, setView] = useState<'create' | 'manage'>('manage')
  const closeModal = useAppStore((state) => state.closeModal)
  return (
    <Suspense fallback={null}>
      {view === 'create' ? (
        <CreateDialog onClose={closeModal} onManage={() => setView('manage')} />
      ) : (
        <Manager onClose={closeModal} onCreate={() => setView('create')} />
      )}
    </Suspense>
  )
}
