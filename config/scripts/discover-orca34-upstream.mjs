import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverOfficialRelease } from './orca34-upstream-discovery.mjs'
import { observeOfficialRelease, withUpstreamReleaseLease } from './orca34-upstream-record.mjs'

export async function runUpstreamDiscovery(directory, discover = discoverOfficialRelease) {
  return withUpstreamReleaseLease(directory, async (root, lease) =>
    observeOfficialRelease(root, await discover(), lease)
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.length !== 1) {
    console.error('Usage: discover-orca34-upstream <persistent-state-directory>')
    process.exitCode = 1
  } else {
    runUpstreamDiscovery(args[0]).then(
      (result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
      (error) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    )
  }
}
