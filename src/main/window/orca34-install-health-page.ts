import { getBuildDistribution } from '../../shared/build-distribution'

export function getOrca34InstallHealthPage(
  packaged: boolean,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return packaged &&
    getBuildDistribution().appId === 'com.orca34.desktop' &&
    env.ORCA_BACKGROUND_LAUNCH === '1' &&
    env.ORCA34_INSTALL_HEALTH_CHECK === '1'
    ? 'install-health.html'
    : undefined
}
