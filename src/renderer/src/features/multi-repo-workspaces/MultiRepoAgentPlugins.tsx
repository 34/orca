import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { MultiRepoAgentPlugins } from '../../../../shared/multi-repo-workspaces/multi-repo-agent-plugins'

export function MultiRepoAgentPluginsFields({
  plugins,
  onChange
}: {
  plugins: MultiRepoAgentPlugins | undefined
  onChange: (plugins: MultiRepoAgentPlugins) => void
}) {
  const value = plugins ?? { codex: [], cursorDirectories: [] }
  const codexText = (enabled: boolean) =>
    value.codex
      .filter((plugin) => plugin.enabled === enabled)
      .map((plugin) => plugin.id)
      .join('\n')
  const changeCodex = (text: string, enabled: boolean) =>
    onChange({
      ...value,
      codex: [
        ...value.codex.filter((plugin) => plugin.enabled !== enabled),
        ...text.split('\n').map((id) => ({ id, enabled }))
      ]
    })
  const save = () =>
    onChange({
      codex: value.codex
        .map((plugin) => ({ ...plugin, id: plugin.id.trim() }))
        .filter((plugin) => plugin.id),
      cursorDirectories: value.cursorDirectories
        .map((directory) => directory.trim())
        .filter(Boolean)
    })
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="multi-codex-plugins-enabled">
          {translate('multiRepoWorkspaces.codexPluginsEnabled', 'Codex plugins to enable')}
        </Label>
        <Textarea
          id="multi-codex-plugins-enabled"
          value={codexText(true)}
          placeholder="plugin-name@marketplace"
          onChange={(event) => changeCodex(event.target.value, true)}
          onBlur={save}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="multi-codex-plugins-disabled">
          {translate('multiRepoWorkspaces.codexPluginsDisabled', 'Codex plugins to disable')}
        </Label>
        <Textarea
          id="multi-codex-plugins-disabled"
          value={codexText(false)}
          placeholder="plugin-name@marketplace"
          onChange={(event) => changeCodex(event.target.value, false)}
          onBlur={save}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="multi-cursor-plugin-directories">
          {translate(
            'multiRepoWorkspaces.cursorPluginDirectories',
            'Cursor local plugin directories'
          )}
        </Label>
        <Textarea
          id="multi-cursor-plugin-directories"
          value={value.cursorDirectories.join('\n')}
          onChange={(event) =>
            onChange({ ...value, cursorDirectories: event.target.value.split('\n') })
          }
          onBlur={save}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'multiRepoWorkspaces.agentPluginScope',
          'One entry per line. These settings apply to the task’s root agent launch and retries. Codex uses configured marketplaces; Cursor loads existing absolute plugin directories. Unlisted plugins keep their existing settings. Authentication and hook trust remain managed by the agent.'
        )}
      </p>
    </div>
  )
}
