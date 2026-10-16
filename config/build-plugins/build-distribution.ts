import { createRequire } from 'node:module'
import type { Plugin } from 'vite'

const distributionBuild: {
  buildDistributionDefine: () => string
  buildDistributionManifest: () => {
    appName: string
    appId: string
    userDataDirectory: string
    devUserDataDirectory: string
  }
} = createRequire(import.meta.url)('../build-distribution.cjs')
export const ORCA_BUILD_DISTRIBUTION_LITERAL = distributionBuild.buildDistributionDefine()

export function createBuildDistributionManifestPlugin(): Plugin {
  return {
    name: 'orca-build-distribution-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'orca-build-distribution.json',
        source: JSON.stringify(distributionBuild.buildDistributionManifest())
      })
    }
  }
}
