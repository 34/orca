import { expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'

const fixture = 'tests/e2e/fixtures/golden-stub-agent/golden-stub-agent.js'

it.each(['\x1b]10;rgb:ffff/ffff/ffff\x1b\\', '\x1b]11;rgb:0000/0000/0000\x07', '\x1b[>0;276;0c'])(
  'keeps the captured ready screen after terminal reply %j',
  async (reply) => {
    const result = await runProcess({
      program: process.execPath,
      args: [fixture, '--codex-ready-transcript'],
      input: `${reply}\x03`,
      timeoutMs: 5000
    })
    expect(result.code, result.stderr).toBe(0)
    expect(result.outputTruncated).toBe(false)
    expect(result.stdout.lastIndexOf('OpenAI Codex')).toBeGreaterThan(
      result.stdout.lastIndexOf('Golden Stub Agent')
    )
  }
)

it('still submits user text after a terminal reply', async () => {
  const result = await runProcess({
    program: process.execPath,
    args: [fixture, '--codex-ready-transcript'],
    input: '\x1b]10;rgb:ffff/ffff/ffff\x1b\\hello\r\x03',
    timeoutMs: 5000
  })
  expect(result.code, result.stderr).toBe(0)
  expect(result.stdout).toContain('[GOLDEN_STUB_AGENT_SUBMITTED] hello')
})
