import distributions from './build-distributions.json'

declare const ORCA_BUILD_DISTRIBUTION: 'orca34' | null

// Packaged identity cannot be changed by an inherited terminal environment.
export function getBuildDistribution() {
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- Source execution has no injected build constant.
  return typeof ORCA_BUILD_DISTRIBUTION !== 'undefined' && ORCA_BUILD_DISTRIBUTION === 'orca34'
    ? distributions.orca34
    : distributions.official
}

export function getManualUpdateMessage(): string | null {
  const distribution = getBuildDistribution()
  return distribution.automaticUpdates
    ? null
    : `${distribution.appName} uses manual updates. Install an ${distribution.appName} package to update this application.`
}
