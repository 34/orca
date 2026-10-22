const base = require('./electron-builder.config.cjs')
const { orca34 } = require('../src/shared/build-distributions.json')
const {
  assertOrca34MacPackage,
  prepareOrca34MacHelper,
  writeOrca34BuildManifest
} = require('./scripts/orca34-mac-package.cjs')

module.exports = {
  ...base,
  appId: orca34.appId,
  productName: orca34.appName,
  protocols: [{ name: orca34.appName, schemes: [orca34.urlScheme] }],
  directories: { ...base.directories, output: 'dist/orca34' },
  files: [...base.files, '!.context{,/**/*}', '!dist{,/**/*}', '!out/bin{,/**/*}'],
  publish: null,
  mac: {
    ...base.mac,
    executableName: orca34.appName,
    identity: '-',
    artifactName: 'orca34-macos-${version}-${arch}.${ext}',
    target: [
      { target: 'dmg', arch: ['arm64'] },
      { target: 'zip', arch: ['arm64'] }
    ]
  },
  dmg: { ...base.dmg, artifactName: 'orca34-macos-${version}-${arch}.${ext}' },
  beforePack(context, ...args) {
    assertOrca34MacPackage(context)
    return base.beforePack(context, ...args)
  },
  async afterPack(context) {
    // Change only the copied helper before the inherited hook signs and verifies it.
    prepareOrca34MacHelper(context)
    await base.afterPack(context)
    writeOrca34BuildManifest(context)
  }
}
