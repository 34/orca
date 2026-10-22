import { expect, it } from 'vitest'
import { multiRepoContextSchema } from './multi-repo-workspace-contract'

const file = {
  id: 'a1234567-1234-4123-8123-123456789abc',
  name: 'context.bin',
  mime: 'application/octet-stream'
}

it('accepts a 10 MiB attachment without exhausting the regular-expression stack', () => {
  const base64 = `${'A'.repeat(13981012)}AA==`
  const context = multiRepoContextSchema.parse({ attachments: [{ ...file, base64 }] })
  expect(context.attachments[0].base64.length).toBe(13981016)
})

it.each(['A', 'AAA', 'A===', '====', 'AA=A', 'AA==AA==', 'AA-_', 'AAA\n', 'AAA\u2028'])(
  'rejects invalid Base64 context encoding %s',
  (base64) => {
    expect(multiRepoContextSchema.safeParse({ attachments: [{ ...file, base64 }] }).success).toBe(
      false
    )
  }
)
