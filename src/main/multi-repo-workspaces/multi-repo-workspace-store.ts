import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import {
  multiRepoTaskIdSchema,
  multiRepoTaskSchema,
  type MultiRepoTask
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { durableWriteTempPath, writeFileDurableSync } from '../durable-file-write'

// One instance per active profile; synchronous commits cannot interleave in the main process.
export class MultiRepoWorkspaceStore {
  private readonly directory: string
  private closed = false

  constructor(
    profilePath: string,
    private readonly profileId: string
  ) {
    this.directory = join(profilePath, 'multi-repo-workspaces', 'tasks')
  }

  close(): void {
    this.closed = true
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('Multi-repo profile owner is closed')
    }
  }

  private path(taskId: string): string {
    return join(this.directory, `${multiRepoTaskIdSchema.parse(taskId)}.json`)
  }

  get(taskId: string): MultiRepoTask | undefined {
    this.assertOpen()
    let contents: string
    try {
      contents = readFileSync(this.path(taskId), 'utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return undefined
      }
      throw error
    }
    const task = multiRepoTaskSchema.parse(JSON.parse(contents))
    if (task.taskId !== taskId || task.profileId !== this.profileId || task.requestId !== taskId) {
      throw new Error('Multi-repo task identity does not match its profile record')
    }
    return task
  }

  list(): MultiRepoTask[] {
    this.assertOpen()
    let names: string[]
    try {
      names = readdirSync(this.directory)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return []
      }
      throw error
    }
    return names
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const task = this.get(name.slice(0, -5))
        if (!task) {
          throw new Error('Multi-repo record disappeared during listing')
        }
        return task
      })
  }

  save(input: MultiRepoTask, expectedRevision: number | null): MultiRepoTask {
    this.assertOpen()
    const task = multiRepoTaskSchema.parse(input)
    if (task.profileId !== this.profileId || task.requestId !== task.taskId) {
      throw new Error('Multi-repo task identity does not match its profile record')
    }
    const current = this.get(task.taskId)
    if ((current?.revision ?? null) !== expectedRevision) {
      throw new Error('Multi-repo task revision conflict')
    }
    if (current && !isDeepStrictEqual(current.plan, task.plan)) {
      throw new Error('A persisted multi-repo plan cannot change')
    }
    const next = { ...task, revision: current ? current.revision + 1 : 0 }
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    const path = this.path(task.taskId)
    writeFileDurableSync(
      durableWriteTempPath(path),
      path,
      `${JSON.stringify(next, null, 2)}\n`,
      0o600
    )
    return next
  }
}
