import { z } from 'zod'

export const multiRepoAgentPluginsSchema = z
  .object({
    codex: z
      .array(
        z
          .object({
            id: z
              .string()
              .regex(/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_.-]+$/)
              .max(200),
            enabled: z.boolean()
          })
          .strict()
      )
      .max(100)
      .refine((entries) => new Set(entries.map((entry) => entry.id)).size === entries.length)
      .default([]),
    cursorDirectories: z
      .array(z.string().min(1).max(4096))
      .max(20)
      .refine((entries) => new Set(entries).size === entries.length)
      .default([])
  })
  .strict()

export type MultiRepoAgentPlugins = z.infer<typeof multiRepoAgentPluginsSchema>
