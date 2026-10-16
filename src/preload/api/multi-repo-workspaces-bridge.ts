import { ipcRenderer } from 'electron'
import type { MultiRepoWorkspacesApi } from './multi-repo-workspaces-api'

export const multiRepoWorkspacesApi = {
  skipSetup: (request) => ipcRenderer.invoke('multiRepoWorkspaces:skipSetup', request),
  previewRemoval: (taskId) => ipcRenderer.invoke('multiRepoWorkspaces:previewRemoval', taskId),
  stopRootForCleanup: (taskId) =>
    ipcRenderer.invoke('multiRepoWorkspaces:stopRootForCleanup', taskId),
  restoreRoot: (request) => ipcRenderer.invoke('multiRepoWorkspaces:restoreRoot', request),
  removeRoot: (request) => ipcRenderer.invoke('multiRepoWorkspaces:removeRoot', request),
  removeMember: (request) => ipcRenderer.invoke('multiRepoWorkspaces:removeMember', request),
  list: () => ipcRenderer.invoke('multiRepoWorkspaces:list'),
  get: (taskId) => ipcRenderer.invoke('multiRepoWorkspaces:get', taskId),
  create: (request) => ipcRenderer.invoke('multiRepoWorkspaces:create', request),
  continue: (taskId) => ipcRenderer.invoke('multiRepoWorkspaces:continue', taskId)
} satisfies MultiRepoWorkspacesApi
