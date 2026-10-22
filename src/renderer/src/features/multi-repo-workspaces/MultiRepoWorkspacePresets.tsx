import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import type { DiscoveredSkill } from '../../../../shared/skills'
import type {
  MultiRepoContext,
  MultiRepoDefaults
} from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export const emptyMultiRepoContext: MultiRepoContext = {
  rules: '',
  agentInstructions: '',
  pluginNotes: '',
  skills: [],
  attachments: []
}

export function MultiRepoWorkspacePresets({
  defaults,
  context,
  onDefaultsChange,
  onContextChange,
  onSave,
  disabled
}: {
  defaults: MultiRepoDefaults
  context: MultiRepoContext
  onDefaultsChange: (value: MultiRepoDefaults) => void
  onContextChange: (value: MultiRepoContext) => void
  onSave: () => void
  disabled: boolean
}) {
  const [skills, setSkills] = useState<DiscoveredSkill[]>([])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <div className="space-y-2">
        <Label htmlFor="multi-branch-template">
          {translate('multiRepoWorkspaces.branchTemplate', 'Branch naming template')}
        </Label>
        <Input
          id="multi-branch-template"
          value={defaults.branchTemplate}
          onChange={(event) =>
            onDefaultsChange({ ...defaults, branchTemplate: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="multi-directory-template">
          {translate('multiRepoWorkspaces.directoryTemplate', 'Directory naming template')}
        </Label>
        <Input
          id="multi-directory-template"
          value={defaults.directoryTemplate}
          onChange={(event) =>
            onDefaultsChange({ ...defaults, directoryTemplate: event.target.value })
          }
        />
        <p className="text-xs text-muted-foreground">
          {translate(
            'multiRepoWorkspaces.templateHint',
            'Use {name} for the task name and {id} for a unique suffix. Keep {id} to avoid collisions.'
          )}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="multi-rules">
          {translate('multiRepoWorkspaces.workspaceRules', 'Workspace AGENTS.md rules')}
        </Label>
        <Textarea
          id="multi-rules"
          value={context.rules}
          onChange={(event) => onContextChange({ ...context, rules: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="multi-agent-instructions">
          {translate('multiRepoWorkspaces.agentInstructions', 'Custom agent instructions')}
        </Label>
        <Textarea
          id="multi-agent-instructions"
          value={context.agentInstructions}
          onChange={(event) =>
            onContextChange({ ...context, agentInstructions: event.target.value })
          }
        />
        <p className="text-xs text-muted-foreground">
          {translate(
            'multiRepoWorkspaces.rulesHint',
            'Written into the root AGENTS.md. Member repository rules remain in effect. Existing agent model and login settings are inherited.'
          )}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={loading}
        onClick={async () => {
          setLoading(true)
          setMessage('')
          try {
            const [inventory, plugins] = await Promise.all([
              window.api.skills.discover(),
              window.api.plugins.list()
            ])
            setSkills(inventory.skills)
            setMessage(
              plugins.map((plugin) => `${plugin.name} · ${plugin.status}`).join('、') ||
                translate('multiRepoWorkspaces.noPlugins', 'No installed Orca plugins.')
            )
          } catch (error) {
            setMessage(String(error))
          } finally {
            setLoading(false)
          }
        }}
      >
        {translate(
          'multiRepoWorkspaces.discoverCapabilities',
          'Discover installed skills and plugins'
        )}
      </Button>
      {skills.length > 0 && (
        <div className="space-y-2">
          <Input
            aria-label={translate('multiRepoWorkspaces.searchSkills', 'Search skills')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate('multiRepoWorkspaces.searchSkills', 'Search skills')}
          />
          <div className="max-h-40 space-y-2 overflow-y-auto scrollbar-sleek">
            {skills
              .filter((skill) =>
                `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase())
              )
              .map((skill) => (
                <label key={skill.id} className="flex items-start gap-2 text-xs">
                  <Checkbox
                    checked={context.skills.some((entry) => entry.path === skill.skillFilePath)}
                    onCheckedChange={(checked) =>
                      onContextChange({
                        ...context,
                        skills: checked
                          ? [...context.skills, { name: skill.name, path: skill.skillFilePath }]
                          : context.skills.filter((entry) => entry.path !== skill.skillFilePath)
                      })
                    }
                  />
                  <span>
                    {skill.name}
                    <span className="block text-muted-foreground">{skill.description}</span>
                  </span>
                </label>
              ))}
          </div>
        </div>
      )}
      {context.skills.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {context.skills.map((skill) => skill.name).join('、')}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="multi-plugin-notes">
          {translate('multiRepoWorkspaces.pluginNotes', 'Plugin usage instructions')}
        </Label>
        <Textarea
          id="multi-plugin-notes"
          value={context.pluginNotes}
          onChange={(event) => onContextChange({ ...context, pluginNotes: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {translate(
            'multiRepoWorkspaces.pluginScopeHint',
            'Selected skills become AGENTS.md references. Plugins use existing Orca settings; these notes guide the agent and do not install or enable plugins.'
          )}
        </p>
      </div>
      <Button type="button" variant="outline" onClick={onSave}>
        {translate('multiRepoWorkspaces.saveDefaults', 'Save as defaults for new tasks')}
      </Button>
    </fieldset>
  )
}
