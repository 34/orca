import { afterEach, expect, it, vi } from 'vitest'
import { parseSkillShareId, skillShareIdFromArguments } from './skill-share-link'
import { encodePairingOffer, decodePairingOffer } from './pairing'
afterEach(() => vi.unstubAllGlobals())
it('accepts the fork desktop scheme and legacy share links with the same path validation', () => {
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  for (const scheme of ['orca', 'orca34']) {
    expect(skillShareIdFromArguments([`${scheme}://skills/share/share_123`])).toBe('share_123')
    expect(parseSkillShareId(`${scheme}://skills/share/share_123/extra`)).toBeNull()
    expect(parseSkillShareId(`${scheme}://attacker/share/share_123`)).toBeNull()
  }
  expect(parseSkillShareId('orca34fake://skills/share/share_123')).toBeNull()
})
it('keeps the official parser limited to its own scheme', () => {
  expect(parseSkillShareId('orca34://skills/share/share_123')).toBeNull()
})
it('keeps pairing payload URLs compatible with existing mobile clients', () => {
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  const offer = {
    v: 2 as const,
    endpoint: 'ws://192.168.1.10:6768',
    deviceToken: 'abcdef1234567890abcdef1234567890abcdef1234567890',
    publicKeyB64: 'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVk'
  }
  const url = encodePairingOffer(offer)
  expect(url.startsWith('orca://pair?code=')).toBe(true)
  expect(decodePairingOffer(url)).toEqual(offer)
})
