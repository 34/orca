export const BUNDLED_MAIN_DEPENDENCIES = new Set([
  'stream-json',
  'stream-chain',
  '@xterm/headless',
  '@xterm/addon-serialize',
  'tldts',
  'smol-toml',
  'fflate',
  // Why: Windows NSIS deploys app.asar before external resources; bootstrap must
  // not race the later resources/node_modules copy.
  'zod'
])
