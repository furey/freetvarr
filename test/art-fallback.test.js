import { test } from 'node:test'
import assert from 'node:assert/strict'
import { artHueOf, artFallbackStyle } from '../src/web/art-fallback.js'

test('artHueOf: the same title always gets the same hue in range', () => {
  assert.equal(artHueOf('The Block'), artHueOf('The Block'))
  assert.ok(artHueOf('The Block') >= 0 && artHueOf('The Block') < 360)
  assert.notEqual(artHueOf('The Block'), artHueOf('Gruen'))
})

test('artFallbackStyle: sets the art hue custom property', () => {
  assert.deepEqual(artFallbackStyle(''), { '--art-hue': '7' })
})
