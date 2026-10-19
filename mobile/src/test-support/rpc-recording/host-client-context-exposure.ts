import type { Context } from 'react'
import type { OperationExposure, operationModuleLoader } from './operation-module-loader'
import type { RpcClientContextValue } from '../../transport/rpc-client-context-contract'

/** The production context exported by `rpc-client-context.ts`. */
export const HOST_CLIENT_CONTEXT_LOCAL = 'RpcClientContext'

/** What the exposure files that local under on the mounted module. */
const RECORDER_HOST_CLIENT_CONTEXT = 'recorderHostClientContext'

const HOST_CLIENT_CONTEXT_MODULE = 'mobile/src/transport/rpc-client-context.ts'

// Keep recording adapters bound to the same context as the production hooks.
export const hostClientContextExposure: OperationExposure = [
  'rpc-client-context.ts',
  `\nexports.${RECORDER_HOST_CLIENT_CONTEXT} = exports.${HOST_CLIENT_CONTEXT_LOCAL};`
]

/** The exposed context, typed by the contract the provider publishes. */
export function loadHostClientContext(
  modules: ReturnType<typeof operationModuleLoader>
): Context<RpcClientContextValue | null> {
  return modules.load<{
    [RECORDER_HOST_CLIENT_CONTEXT]: Context<RpcClientContextValue | null>
  }>(HOST_CLIENT_CONTEXT_MODULE)[RECORDER_HOST_CLIENT_CONTEXT]
}
