import { translate } from '@/i18n/i18n'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { MultiRepoMemberSelection } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export function MultiRepoMemberFields({
  member,
  name,
  onChange
}: {
  member: MultiRepoMemberSelection
  name: string
  onChange: (member: MultiRepoMemberSelection) => void
}) {
  const id = `multi-repo-${member.repoId}`
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">{name}</legend>
      <div className="space-y-2">
        <Label htmlFor={`${id}-directory`}>
          {translate('multiRepoWorkspaces.memberDirectory', 'Member directory')}
        </Label>
        <Input
          id={`${id}-directory`}
          value={member.directoryName}
          onChange={(event) => onChange({ ...member, directoryName: event.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-base`}>{translate('multiRepoWorkspaces.baseRef', 'Base ref')}</Label>
        <Input
          id={`${id}-base`}
          value={member.baseRef}
          onChange={(event) => onChange({ ...member, baseRef: event.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-branch`}>
          {translate('multiRepoWorkspaces.branch', 'New branch')}
        </Label>
        <Input
          id={`${id}-branch`}
          value={member.branchName}
          onChange={(event) => onChange({ ...member, branchName: event.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-setup`}>{translate('multiRepoWorkspaces.setup', 'Setup')}</Label>
        <Select
          value={member.setupDecision}
          onValueChange={(value) => {
            if (value === 'run' || value === 'skip' || value === 'inherit') {
              onChange({ ...member, setupDecision: value })
            }
          }}
        >
          <SelectTrigger id={`${id}-setup`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="run">
              {translate('multiRepoWorkspaces.runSetup', 'Run setup')}
            </SelectItem>
            <SelectItem value="skip">
              {translate('multiRepoWorkspaces.skipSetup', 'Skip setup')}
            </SelectItem>
            <SelectItem value="inherit">
              {translate('multiRepoWorkspaces.inheritSetup', 'Follow repository policy')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </fieldset>
  )
}
