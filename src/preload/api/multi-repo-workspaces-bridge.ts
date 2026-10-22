import { ipcRenderer } from 'electron'
import type { MultiRepoWorkspacesApi } from './multi-repo-workspaces-api'

export const multiRepoWorkspacesApi = {
  defaults: () => ipcRenderer.invoke('multiRepoWorkspaces:defaults'),
  saveDefaults: (request) => ipcRenderer.invoke('multiRepoWorkspaces:saveDefaults', request),
  addMembers: (request) => ipcRenderer.invoke('multiRepoWorkspaces:addMembers', request),
  parentDirectory: () => ipcRenderer.invoke('multiRepoWorkspaces:parentDirectory'),
  saveParentDirectory: (request) =>
    ipcRenderer.invoke('multiRepoWorkspaces:saveParentDirectory', request),
  retrySetup: (request) => ipcRenderer.invoke('multiRepoWorkspaces:retrySetup', request),
  skipSetup: (request) => ipcRenderer.invoke('multiRepoWorkspaces:skipSetup', request),
  previewRemoval: (taskId) => ipcRenderer.invoke('multiRepoWorkspaces:previewRemoval', taskId),
  stopRootForCleanup: (taskId) =>
    ipcRenderer.invoke('multiRepoWorkspaces:stopRootForCleanup', taskId),
  restoreRoot: (request) => ipcRenderer.invoke('multiRepoWorkspaces:restoreRoot', request),
  removeRoot: (request) => ipcRenderer.invoke('multiRepoWorkspaces:removeRoot', request),
  removeMember: (request) => ipcRenderer.invoke('multiRepoWorkspaces:removeMember', request),
  list: () => ipcRenderer.invoke('multiRepoWorkspaces:list'),
  get: (taskId) => ipcRenderer.invoke('multiRepoWorkspaces:get', taskId),
  previewCreate: (request) => ipcRenderer.invoke('multiRepoWorkspaces:previewCreate', request),
  create: (request) => ipcRenderer.invoke('multiRepoWorkspaces:create', request),
  continue: (taskId) => ipcRenderer.invoke('multiRepoWorkspaces:continue', taskId)
} satisfies MultiRepoWorkspacesApi
