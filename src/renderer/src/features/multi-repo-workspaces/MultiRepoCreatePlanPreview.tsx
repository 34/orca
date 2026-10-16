import type {
  MultiRepoWorkspacePlan,
  MultiRepoCreateRequest
} from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export function MultiRepoCreatePlanPreview({
  plan,
  request
}: {
  plan: MultiRepoWorkspacePlan
  request: MultiRepoCreateRequest
}) {
  return (
    <section aria-label="确认创建计划" className="space-y-3 text-sm">
      <h3 className="font-medium">{request.name}</h3>
      {request.prompt && <p className="whitespace-pre-wrap break-words">{request.prompt}</p>}
      <p>根 Agent：{request.agent ?? '不启动'}</p>
      <p className="break-all font-mono text-xs">{plan.rootPath}</p>
      <p className="text-xs text-muted-foreground">
        尚未创建任何工作树。确认时会重新核验；起始提交或目录变化后需要重新预览。
      </p>
      {plan.members.map((member) => (
        <dl key={member.repoId} className="space-y-1 rounded-md border border-border p-3">
          <dt className="font-medium">{member.directoryName}</dt>
          <dd className="break-all">源仓库：{member.repoPath}</dd>
          <dd className="break-all">目标目录：{member.worktreePath}</dd>
          <dd className="break-all">起始 ref：{member.baseRef}</dd>
          <dd className="break-all font-mono text-xs">起始 commit：{member.baseCommit}</dd>
          <dd className="break-all">新分支：{member.branchName}</dd>
          <dd>
            Setup：
            {member.setupDecision === 'run'
              ? '运行'
              : member.setupDecision === 'skip'
                ? '跳过'
                : '遵循仓库设置'}
          </dd>
        </dl>
      ))}
    </section>
  )
}
