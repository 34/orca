import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { MultiRepoRemovalPreview as Preview } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-removal-preview'

export function MultiRepoRemovalPreview({ taskId }: { taskId: string }) {
  const confirm = useConfirmationDialog()
  const [stopMessage, setStopMessage] = useState('')
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <section className="space-y-3 border-t border-border pt-3" aria-label="清理预览">
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          setPreview(undefined)
          try {
            setPreview(await window.api.multiRepoWorkspaces.previewRemoval(taskId))
          } catch (failure) {
            setError(String(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? '正在检查…' : '检查清理影响'}
      </Button>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          const accepted = await confirm({
            title: '停止根工作区会话？',
            description:
              '将关闭该需求根工作区的终端和原生 Chat。正在运行的任务会中断；文件和分支会保留。',
            confirmLabel: '停止根会话',
            cancelLabel: '取消',
            confirmVariant: 'destructive'
          })
          if (!accepted) {
            return
          }
          setBusy(true)
          setError('')
          setStopMessage('')
          try {
            await window.api.multiRepoWorkspaces.stopRootForCleanup(taskId)
            setStopMessage('根会话停止检查已通过。此后新开的会话仍需在清理时重新检查。')
          } catch (failure) {
            setError(String(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        停止根会话
      </Button>
      {stopMessage && (
        <p role="status" className="text-sm">
          {stopMessage}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {preview && (
        <div className="space-y-3 text-sm">
          <p>本次仅检查，不删除文件。清理前还需停止根会话与成员服务，并重新核验。</p>
          {preview.rootError && (
            <p role="alert" className="text-destructive">
              {preview.rootError}
            </p>
          )}
          <p>未修改的根元文件：{preview.removableRootFiles.join('、') || '无'}</p>
          <p>保留的根目录内容：{preview.retainedRootEntries.join('、') || '无'}</p>
          {preview.members.map((member) => (
            <div key={member.repoId} className="space-y-1">
              <p className="break-all font-mono text-xs">{member.path}</p>
              <p>保留分支：{member.branch}</p>
              {member.error ? (
                <p role="alert" className="text-destructive">
                  {member.error}
                </p>
              ) : (
                <>
                  <p>未提交或未跟踪：{member.changedPaths.join('、') || '无'}</p>
                  <p>被 Git 忽略的内容：{member.ignoredPaths.join('、') || '无'}</p>
                  {member.truncated && (
                    <p className="text-destructive">文件列表未完整读取，不能据此判断可安全清理。</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
