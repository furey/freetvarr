import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const router = readFileSync(new URL('../src/web/shared/router.js', import.meta.url), 'utf8')
const syncs = readFileSync(new URL('../src/web/views/syncs-view.js', import.meta.url), 'utf8')

test('collapsing a linked sync keeps the history entry key, so Back restores the scroll position', () => {
  assert.match(router, /export const replaceSectionInPlace = \(\{ hash, section \}\) => \{\n\s*history\.replaceState\(history\.state, '', hash\)\n\s*currentHash = window\.location\.hash\n\s*routeSection\.value = section\n\}/)
  assert.match(syncs, /replaceSectionInPlace\(\{ hash: '#\/settings\/system\/activity\/syncs', section: 'syncs' \}\)/)
  assert.doesNotMatch(syncs, /history\.replaceState\(null/)
})
