import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  multiRepoDefaultsSchema,
  type MultiRepoDefaults
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { durableWriteTempPath, writeFileDurableSync } from '../durable-file-write'

export function readMultiRepoDefaults(profilePath: string): MultiRepoDefaults {
  try {
    return multiRepoDefaultsSchema.parse(
      JSON.parse(readFileSync(join(profilePath, 'multi-repo-workspaces', 'defaults.json'), 'utf8'))
    )
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return multiRepoDefaultsSchema.parse({})
    }
    throw error
  }
}

export function saveMultiRepoDefaults(profilePath: string, input: unknown): MultiRepoDefaults {
  const defaults = multiRepoDefaultsSchema.parse(input)
  for (const template of [defaults.branchTemplate, defaults.directoryTemplate]) {
    if (!template.includes('{id}') || /\{(?!name\}|id\})/.test(template)) {
      throw new Error('Templates must include {id}; supported variables are {name} and {id}')
    }
  }
  const directory = join(profilePath, 'multi-repo-workspaces')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, 'defaults.json')
  writeFileDurableSync(durableWriteTempPath(path), path, JSON.stringify(defaults), 0o600)
  return defaults
}
