import { useEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { isWslUncPath } from '../../../../shared/wsl-paths'
import type { Repo } from '../../../../shared/repo-types'
import {
  multiRepoDefaultsSchema,
  type MultiRepoCreateRequest,
  type MultiRepoTask,
  type MultiRepoWorkspacePlan
} from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { emptyMultiRepoContext } from './MultiRepoWorkspacePresets'
import { multiRepoDraftNames } from './multi-repo-draft-name'

export function useMultiRepoCreation() {
  const [draft, setDraft] = useState<MultiRepoCreateRequest>(() => {
    const requestId = createBrowserUuid()
    return {
      requestId,
      name: '',
      prompt: '',
      parentPath: '',
      directoryName: multiRepoDraftNames('', requestId).directoryName,
      members: []
    }
  })
  const [defaults, setDefaults] = useState(() => multiRepoDefaultsSchema.parse({}))
  const [defaultParentPath, setDefaultParentPath] = useState<string>()
  const [repos, setRepos] = useState<Repo[]>([])
  const [preview, setPreview] = useState<MultiRepoWorkspacePlan>()
  const [task, setTask] = useState<MultiRepoTask>()
  const [status, setStatus] = useState({ busy: false, error: '', loaded: false })
  const submitted = useRef<MultiRepoCreateRequest | null>(null)
  useEffect(() => {
    let disposed = false
    void Promise.all([
      window.api.repos.list(),
      window.api.multiRepoWorkspaces.parentDirectory(),
      window.api.multiRepoWorkspaces.defaults()
    ])
      .then(([rows, directory, preferences]) => {
        if (!disposed) {
          setDefaults(preferences)
          setDraft((value) => ({
            ...value,
            agent: preferences.agent,
            directoryName: multiRepoDraftNames(value.name, value.requestId, preferences)
              .directoryName,
            context: {
              ...emptyMultiRepoContext,
              rules: preferences.rules,
              agentInstructions: preferences.agentInstructions,
              agentArgs: preferences.agentArgs,
              skills: preferences.skills,
              pluginNotes: preferences.pluginNotes
            }
          }))
          setDefaultParentPath(directory.defaultParentPath)
          setDraft((value) => ({ ...value, parentPath: value.parentPath || directory.parentPath }))
          setRepos(
            rows.filter(
              (repo) =>
                repo.kind !== 'folder' &&
                getRepoExecutionHostId(repo) === 'local' &&
                !isWslUncPath(repo.path)
            )
          )
          setStatus((value) => ({ ...value, loaded: true }))
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setStatus({ busy: false, loaded: false, error: String(error) })
        }
      })
    return () => {
      disposed = true
    }
  }, [])
  const submitting = useRef(false)
  const submit = async (previewOnly = false) => {
    if (submitting.current) {
      return
    }
    submitting.current = true
    setStatus((value) => ({ ...value, busy: true, error: '' }))
    try {
      if (!preview && !submitted.current) {
        let current = draft
        if (current.parentPath === defaultParentPath) {
          const parentPath = await window.api.multiRepoWorkspaces.saveParentDirectory({
            source: 'default'
          })
          current = { ...current, parentPath }
          setDraft(current)
        }
        const plan = await window.api.multiRepoWorkspaces.previewCreate(current)
        if (previewOnly) {
          setPreview(plan)
          return
        }
        submitted.current = { ...current, confirmedPlan: plan }
      }
      submitted.current ??= { ...draft, confirmedPlan: preview }
      setTask(await window.api.multiRepoWorkspaces.create(submitted.current))
    } catch (error) {
      if (submitted.current) {
        try {
          const current = await window.api.multiRepoWorkspaces.get(submitted.current.requestId)
          if (current) {
            setTask(current)
          } else {
            submitted.current = null
            setPreview(undefined)
          }
        } catch {
          /* Keep the same request after an unknown outcome. */
        }
      }
      setStatus((value) => ({ ...value, error: String(error) }))
    } finally {
      submitting.current = false
      setStatus((value) => ({ ...value, busy: false }))
    }
  }
  return {
    draft,
    setDraft,
    defaults,
    setDefaults,
    defaultParentPath,
    repos,
    preview,
    setPreview,
    task,
    status,
    setStatus,
    submitted,
    submit
  }
}
