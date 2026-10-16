import { translate } from '@/i18n/i18n'
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
    <section
      aria-label={translate('multiRepoWorkspaces.confirmPlan', 'Confirm creation plan')}
      className="space-y-3 text-sm"
    >
      <h3 className="font-medium">{request.name}</h3>
      {request.prompt && <p className="whitespace-pre-wrap break-words">{request.prompt}</p>}
      <p>
        {translate('multiRepoWorkspaces.rootAgentLabel', 'Root agent: ')}
        {request.agent ?? translate('multiRepoWorkspaces.noAgent', 'Do not start')}
      </p>
      <p className="break-all font-mono text-xs">{plan.rootPath}</p>
      <p className="text-xs text-muted-foreground">
        {translate(
          'multiRepoWorkspaces.previewNotice',
          'No worktrees have been created. Confirmation rechecks the plan; preview again if a base commit or directory changes.'
        )}
      </p>
      {plan.members.map((member) => (
        <dl key={member.repoId} className="space-y-1 rounded-md border border-border p-3">
          <dt className="font-medium">{member.directoryName}</dt>
          <dd className="break-all">
            {translate('multiRepoWorkspaces.sourceRepoLabel', 'Source repository: ')}
            {member.repoPath}
          </dd>
          <dd className="break-all">
            {translate('multiRepoWorkspaces.targetDirectoryLabel', 'Target directory: ')}
            {member.worktreePath}
          </dd>
          <dd className="break-all">
            {translate('multiRepoWorkspaces.baseRefLabel', 'Base ref: ')}
            {member.baseRef}
          </dd>
          <dd className="break-all font-mono text-xs">
            {translate('multiRepoWorkspaces.baseCommitLabel', 'Base commit: ')}
            {member.baseCommit}
          </dd>
          <dd className="break-all">
            {translate('multiRepoWorkspaces.branchLabel', 'New branch: ')}
            {member.branchName}
          </dd>
          <dd>
            {translate('multiRepoWorkspaces.setupLabel', 'Setup: ')}
            {member.setupDecision === 'run'
              ? translate('multiRepoWorkspaces.run', 'Run')
              : member.setupDecision === 'skip'
                ? translate('multiRepoWorkspaces.skip', 'Skip')
                : translate('multiRepoWorkspaces.followRepo', 'Follow repository settings')}
          </dd>
        </dl>
      ))}
    </section>
  )
}
