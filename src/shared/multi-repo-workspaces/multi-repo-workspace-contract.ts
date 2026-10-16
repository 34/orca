import { AgentLaunchFields } from '../rpc-contract/agent-launch-params'
import { isAgentLaunchResult, type AgentLaunchResult } from '../agent-launch-intent'
import { z } from 'zod'

export const multiRepoMemberSelectionSchema = z.object({
  repoId: z.string().min(1),
  directoryName: z.string().min(1),
  baseRef: z.string().min(1),
  branchName: z.string().min(1),
  setupDecision: z.enum(['run', 'skip', 'inherit'])
})

export const multiRepoMemberPlanSchema = multiRepoMemberSelectionSchema.extend({
  repoPath: z.string().min(1),
  commonDir: z.string().min(1),
  baseCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  worktreePath: z.string().min(1)
})

export const multiRepoWorkspacePlanSchema = z.object({
  parentPath: z.string().min(1),
  rootPath: z.string().min(1),
  members: z.array(multiRepoMemberPlanSchema).min(1)
})

export const multiRepoTaskIdSchema = z.string().uuid()

export const multiRepoTaskSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskId: multiRepoTaskIdSchema,
    requestId: multiRepoTaskIdSchema,
    revision: z.number().int().nonnegative(),
    profileId: z.string().min(1),
    hostId: z.literal('local'),
    name: z.string().min(1),
    prompt: z.string(),
    plan: multiRepoWorkspacePlanSchema,
    root: z.object({
      state: z.enum(['planned', 'creating', 'created', 'needs-attention', 'removed']),
      cleanupIdentity: z.object({ device: z.string().min(1), inode: z.string().min(1) }).optional(),
      folderWorkspaceId: z.string().optional(),
      projectGroupId: z.string().optional(),
      folderRegistration: z.enum(['creating', 'registered']).optional(),
      error: z.string().optional()
    }),
    members: z
      .array(
        z.object({
          repoId: z.string().min(1),
          state: z.enum([
            'planned',
            'creating',
            'registered',
            'ready',
            'needs-attention',
            'removing',
            'removed'
          ]),
          worktreeId: z.string().optional(),
          instanceId: z.string().optional(),
          plannedInstanceId: z.string().uuid().optional(),
          preparation: z
            .object({ state: z.literal('finished'), warning: z.string().optional() })
            .optional(),
          setupCompletionToken: z.string().uuid().optional(),
          setupExitCode: z.number().int().optional(),
          setupTerminalHandle: z.string().optional(),
          setup: z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped']),
          error: z.string().optional()
        })
      )
      .min(1),
    agent: z.object({
      state: z.enum(['pending', 'starting', 'started', 'failed']),
      selected: AgentLaunchFields.shape.agent.optional(),
      operationId: AgentLaunchFields.shape.operationId,
      result: z.custom<AgentLaunchResult>(isAgentLaunchResult).optional(),
      error: z.string().optional()
    })
  })
  .strict()
  .refine(
    (task) =>
      task.members.length === task.plan.members.length &&
      task.members.every((member, index) => member.repoId === task.plan.members[index].repoId),
    'Multi-repo member state does not match its plan'
  )

export type MultiRepoMemberSelection = z.infer<typeof multiRepoMemberSelectionSchema>
export type MultiRepoMemberPlan = z.infer<typeof multiRepoMemberPlanSchema>
export type MultiRepoWorkspacePlan = z.infer<typeof multiRepoWorkspacePlanSchema>
export type MultiRepoTask = z.infer<typeof multiRepoTaskSchema>

export const multiRepoCreateRequestSchema = z
  .object({
    requestId: multiRepoTaskIdSchema,
    agent: AgentLaunchFields.shape.agent.optional(),
    confirmedPlan: multiRepoWorkspacePlanSchema.optional(),
    name: z.string().trim().min(1).max(200),
    prompt: z.string().max(100000),
    parentPath: z.string().min(1),
    directoryName: z.string().min(1),
    members: z.array(multiRepoMemberSelectionSchema).min(1).max(100)
  })
  .strict()
export type MultiRepoCreateRequest = z.infer<typeof multiRepoCreateRequestSchema>

export const multiRepoRemoveMemberRequestSchema = z
  .object({
    taskId: multiRepoTaskIdSchema,
    repoId: z.string().min(1),
    revision: z.number().int().nonnegative()
  })
  .strict()
export type MultiRepoRemoveMemberRequest = z.infer<typeof multiRepoRemoveMemberRequestSchema>

export const multiRepoRemoveRootRequestSchema = z
  .object({
    taskId: multiRepoTaskIdSchema,
    revision: z.number().int().nonnegative()
  })
  .strict()

export type MultiRepoRemoveRootRequest = z.infer<typeof multiRepoRemoveRootRequestSchema>

export const multiRepoRestoreRootRequestSchema = multiRepoRemoveRootRequestSchema
export type MultiRepoRestoreRootRequest = z.infer<typeof multiRepoRestoreRootRequestSchema>

export const multiRepoSkipSetupRequestSchema = multiRepoRemoveMemberRequestSchema
export type MultiRepoSkipSetupRequest = z.infer<typeof multiRepoSkipSetupRequestSchema>
