import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from 'yaml'
import { expect, it } from 'vitest'

it('routes every Blacksmith PR job to a hosted fork runner while preserving official runners', () => {
  const workflow = parse(readFileSync('.github/workflows/pr.yml', 'utf8'))
  const runners = Object.values(workflow.jobs)
    .flatMap((job) => [job['runs-on'], job.with?.runner])
    .filter((runner) => typeof runner === 'string' && runner.includes('blacksmith-'))
  expect(runners.length).toBeGreaterThanOrEqual(4)
  for (const runner of runners) {
    expect(runner).toMatch(/^\$\{\{ .* \}\}$/)
    const expression = runner.slice(3, -2)
    const select = (repository) => runInNewContext(expression, { github: { repository } })
    expect(select('34/orca')).toBe('ubuntu-24.04')
    expect(select('stablyai/orca')).toMatch(/^blacksmith-\d+vcpu-ubuntu-\d+$/)
  }
})
