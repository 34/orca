export function supportsMultiRepoRootAgent(agent: string): boolean {
  return agent === 'codex' || agent === 'claude' || agent === 'cursor'
}
