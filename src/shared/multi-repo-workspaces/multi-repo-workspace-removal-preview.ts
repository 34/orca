export type MultiRepoRemovalPreview = {
  taskId: string
  revision: number
  rootPath: string
  rootError?: string
  removableRootFiles: string[]
  retainedRootEntries: string[]
  members: {
    repoId: string
    path: string
    branch: string
    removed?: boolean
    preserveBranch: true
    changedPaths: string[]
    ignoredPaths: string[]
    truncated: boolean
    error?: string
  }[]
}
