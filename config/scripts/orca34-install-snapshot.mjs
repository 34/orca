import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  cp,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { runProcess } from '@orca/process-host'

async function fileDigest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

export async function inspectInstallTree(root, { excludeProfileAccess = false } = {}) {
  const entries = []
  const walk = async (path, name) => {
    const stat = await lstat(path)
    const mode = stat.mode & 0o7777
    if (stat.isSymbolicLink()) {
      entries.push({ name, type: 'link', target: await readlink(path) })
    } else if (stat.isDirectory()) {
      entries.push({ name, type: 'directory', mode })
      for (const child of (await readdir(path)).sort()) {
        if (!name && excludeProfileAccess && child === '.profile-state-access') {
          continue
        }
        await walk(join(path, child), name ? `${name}/${child}` : child)
      }
    } else if (stat.isFile()) {
      entries.push({ name, type: 'file', mode, size: stat.size, sha256: await fileDigest(path) })
    } else {
      throw new Error(`Cannot snapshot special filesystem entry: ${path}`)
    }
  }
  await walk(root, '')
  return entries
}

export function assertSeparateInstallPaths(paths) {
  const resolved = paths.map((path) => {
    if (!isAbsolute(path)) {
      throw new Error('Installation paths must be absolute')
    }
    return resolve(path)
  })
  for (let a = 0; a < resolved.length; a++) {
    for (let b = a + 1; b < resolved.length; b++) {
      for (const [parent, child] of [
        [resolved[a], resolved[b]],
        [resolved[b], resolved[a]]
      ]) {
        const rel = relative(parent, child)
        if (!rel || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) {
          throw new Error('Installation source, snapshot and destination must not overlap')
        }
      }
    }
  }
}

export async function writeInstallReceipt(path, value) {
  const temporary = `${path}.pending`
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(temporary, path)
  const parent = await open(dirname(path), 'r')
  try {
    await parent.sync()
  } finally {
    await parent.close()
  }
}

export async function createInstallSnapshot(
  sourcePath,
  snapshotPath,
  { excludeProfileAccess = false } = {}
) {
  const source = await realpath(sourcePath)
  const parent = await realpath(dirname(snapshotPath))
  if (parent !== dirname(resolve(snapshotPath)) || source !== resolve(sourcePath)) {
    throw new Error('Installation roots must use canonical paths, not symbolic links')
  }
  assertSeparateInstallPaths([source, snapshotPath])
  if (!(await lstat(source)).isDirectory()) {
    throw new Error('Installation snapshot source must be a directory')
  }
  const before = await inspectInstallTree(source, { excludeProfileAccess })
  // Exclusive creation preserves failed attempts for diagnosis instead of overwriting backups.
  await mkdir(snapshotPath, { mode: 0o700 })
  const copy = join(snapshotPath, 'contents')
  if (process.platform === 'darwin') {
    // ditto also preserves macOS ACLs and extended attributes omitted by fs.cp.
    const result = await runProcess({
      program: '/usr/bin/ditto',
      args: ['--rsrc', '--extattr', '--acl', source, copy],
      timeoutMs: 300_000,
      maxOutputBytes: 8192
    })
    if (result.code !== 0 || result.timedOut || result.outputTruncated || result.stderr.trim()) {
      throw new Error(`Installation snapshot copy failed: ${result.stderr}`)
    }
  } else {
    await cp(source, copy, {
      recursive: true,
      verbatimSymlinks: true,
      preserveTimestamps: true,
      errorOnExist: true,
      force: false
    })
  }
  if (excludeProfileAccess) {
    // Runtime owner records belong to the running host, never to a restored data snapshot.
    await rm(join(copy, '.profile-state-access'), { recursive: true, force: true })
  }
  const copied = await inspectInstallTree(copy)
  const after = await inspectInstallTree(source, { excludeProfileAccess })
  if (
    JSON.stringify(before) !== JSON.stringify(after) ||
    JSON.stringify(before) !== JSON.stringify(copied)
  ) {
    throw new Error(
      `Installation snapshot changed during copy or failed verification: ${snapshotPath}`
    )
  }
  const receipt = {
    schemaVersion: 1,
    source,
    createdAt: new Date().toISOString(),
    excludeProfileAccess,
    entries: copied
  }
  await writeInstallReceipt(join(snapshotPath, 'snapshot.json'), receipt)
  return receipt
}

export async function verifyInstallSnapshot(snapshotPath) {
  const receipt = JSON.parse(await readFile(join(snapshotPath, 'snapshot.json'), 'utf8'))
  if (
    receipt.schemaVersion !== 1 ||
    typeof receipt.source !== 'string' ||
    !isAbsolute(receipt.source) ||
    !Array.isArray(receipt.entries)
  ) {
    throw new Error('Invalid installation snapshot receipt')
  }
  const actual = await inspectInstallTree(join(snapshotPath, 'contents'))
  if (JSON.stringify(receipt.entries) !== JSON.stringify(actual)) {
    throw new Error('Installation snapshot no longer matches its verified contents')
  }
  return receipt
}
