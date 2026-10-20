import { randomUUID } from 'node:crypto'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { RpcDispatcher } from '../runtime/rpc/dispatcher'
import { AGENT_LAUNCH_METHODS } from '../runtime/rpc/methods/agent-launch'
import { DESKTOP_RPC_CALLER } from '../runtime/rpc/rpc-caller-identity'
import { DESKTOP_RENDERER_RUNTIME_CLIENT_CAPABILITIES } from '../ipc/desktop-renderer-runtime-capabilities'
import { isAgentLaunchResult } from '../../shared/agent-launch-intent'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { verifyMultiRepoWorkspaceIdentity } from './multi-repo-workspace-identity'

export async function launchMultiRepoRootAgent(
  runtime: OrcaRuntimeService,
  task: MultiRepoTask,
  replay: boolean
) {
  if (!task.agent.selected || !task.agent.operationId || !task.root.folderWorkspaceId) {
    throw new Error('Multi-repo root launch is missing its persisted intent')
  }
  await verifyMultiRepoWorkspaceIdentity({
    ...task.plan,
    members: task.plan.members.filter(
      (plan) => task.members.find((member) => member.repoId === plan.repoId)?.state !== 'removed'
    )
  })
  const response = await new RpcDispatcher({ runtime, methods: AGENT_LAUNCH_METHODS }).dispatch(
    {
      id: task.taskId,
      authToken: 'desktop-ipc',
      method: replay ? 'agent.launchReplay' : 'agent.launch',
      params: {
        operationId: task.agent.operationId,
        agent: task.agent.selected,
        ...(task.context?.agentArgs !== undefined ? { agentArgs: task.context.agentArgs } : {}),
        target: { kind: 'existing', worktree: `folder:${task.root.folderWorkspaceId}` },
        prompt: {
          text: `Read AGENTS.md if present and TASK.md in the workspace root. Current member directories: ${task.plan.members
            .filter(
              (plan) =>
                task.members.find((member) => member.repoId === plan.repoId)?.state !== 'removed'
            )
            .map((member) => member.directoryName)
            .join(', ')}. Carry out this request across those repositories:\n\n${task.prompt}`,
          delivery: 'submit'
        },
        presentation: 'background'
      }
    },
    {
      clientId: 'desktop-renderer',
      caller: DESKTOP_RPC_CALLER,
      clientKind: 'runtime',
      clientCapabilities: DESKTOP_RENDERER_RUNTIME_CLIENT_CAPABILITIES
    }
  )
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  if (!isAgentLaunchResult(response.result)) {
    throw new Error('Invalid root Agent launch result')
  }
  return response.result
}

export async function startMultiRepoRootAgent(args: {
  task: MultiRepoTask
  journal: MultiRepoWorkspaceStore
  launch: (task: MultiRepoTask, replay: boolean) => ReturnType<typeof launchMultiRepoRootAgent>
}): Promise<MultiRepoTask> {
  let { task } = args
  if (
    !task.agent.selected ||
    task.agent.relaunchRequired ||
    task.agent.state === 'started' ||
    task.members.some((member) => member.state !== 'ready' && member.state !== 'removed')
  ) {
    return task
  }
  const replay = Boolean(task.agent.operationId)
  task.agent.operationId ??= `${Date.now()}-${randomUUID().replaceAll('-', '')}`
  task.agent.state = 'starting'
  task.agent.error = undefined
  task = args.journal.save(task, task.revision)
  try {
    task.agent.result = await args.launch(task, replay)
    task.agent.state = 'started'
  } catch (error) {
    task.agent.state = 'failed'
    task.agent.error = error instanceof Error ? error.message : String(error)
  }
  return args.journal.save(task, task.revision)
}
