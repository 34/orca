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

export const multiRepoContextSchema = z
  .object({
    rules: z.string().max(30000).default(''),
    agentInstructions: z.string().max(30000).default(''),
    agentArgs: z.string().max(10000).optional(),
    skills: z
      .array(z.object({ name: z.string().max(200), path: z.string().max(4096) }))
      .max(100)
      .default([]),
    pluginNotes: z.string().max(10000).default(''),
    attachments: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().min(1).max(255),
            mime: z.string().max(200),
            base64: z
              .string()
              .max(14000000)
              .regex(/^[A-Za-z0-9+/]*={0,2}$/)
              .refine(
                (value) => value.length % 4 === 0 && value === value.trimEnd(),
                'Invalid Base64 attachment encoding'
              )
          })
          .strict()
      )
      .max(20)
      .default([])
  })
  .strict()
  .refine(
    (value) => value.attachments.reduce((size, file) => size + file.base64.length, 0) <= 28000000,
    'Attachments must total at most 20 MB'
  )
  .refine(
    (value) => new Set(value.attachments.map((file) => file.id)).size === value.attachments.length,
    'Attachment identities must be unique'
  )
export type MultiRepoContext = z.infer<typeof multiRepoContextSchema>

export const multiRepoDefaultsSchema = z
  .object({
    branchTemplate: z.string().min(1).max(200).default('task/{name}-{id}'),
    directoryTemplate: z.string().min(1).max(200).default('request-{name}-{id}'),
    rules: z.string().max(30000).default(''),
    agentInstructions: z.string().max(30000).default(''),
    agentArgs: z.string().max(10000).optional(),
    pluginNotes: z.string().max(10000).default(''),
    skills: z
      .array(z.object({ name: z.string().max(200), path: z.string().max(4096) }))
      .max(100)
      .default([]),
    agent: AgentLaunchFields.shape.agent.optional()
  })
  .strict()
export type MultiRepoDefaults = z.infer<typeof multiRepoDefaultsSchema>

export const multiRepoTaskSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskId: multiRepoTaskIdSchema,
    requestId: multiRepoTaskIdSchema,
    revision: z.number().int().nonnegative(),
    profileId: z.string().min(1),
    hostId: z.literal('local'),
    name: z.string().min(1),
    createdAt: z.number().nonnegative().optional(),
    prompt: z.string(),
    context: multiRepoContextSchema.optional(),
    pendingRootPlan: multiRepoWorkspacePlanSchema.optional(),
    retiredMembers: z.array(multiRepoMemberPlanSchema).max(1000).optional(),
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
          setupNotStarted: z.literal(true).optional(),
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
      relaunchRequired: z.boolean().optional(),
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
    context: multiRepoContextSchema.optional(),
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

export const multiRepoAddMembersRequestSchema = z
  .object({
    taskId: multiRepoTaskIdSchema,
    revision: z.number().int().nonnegative(),
    members: z.array(multiRepoMemberSelectionSchema).min(1).max(100)
  })
  .strict()
export type MultiRepoAddMembersRequest = z.infer<typeof multiRepoAddMembersRequestSchema>
