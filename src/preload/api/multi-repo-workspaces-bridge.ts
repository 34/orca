import { ipcRenderer } from 'electron'
import type { MultiRepoWorkspacesApi } from './multi-repo-workspaces-api'

export const multiRepoWorkspacesApi = {
  previewRemoval: (taskId) => ipcRenderer.invoke('multiRepoWorkspaces:previewRemoval', taskId),
  stopRootForCleanup: (taskId) =>
    ipcRenderer.invoke('multiRepoWorkspaces:stopRootForCleanup', taskId),
  list: () => ipcRenderer.invoke('multiRepoWorkspaces:list'),
  get: (taskId) => ipcRenderer.invoke('multiRepoWorkspaces:get', taskId),
  create: (request) => ipcRenderer.invoke('multiRepoWorkspaces:create', request),
  continue: (taskId) => ipcRenderer.invoke('multiRepoWorkspaces:continue', taskId)
} satisfies MultiRepoWorkspacesApi
