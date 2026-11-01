import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hiddenEdgesOf } from '../src/web/shared/scroll-fade.js'

test('hiddenEdgesOf: no fade when every chip fits', () => {
  assert.deepEqual(hiddenEdgesOf({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 }), { start: false, end: false })
})

test('hiddenEdgesOf: fades the end at rest when chips sit to the right', () => {
  assert.deepEqual(hiddenEdgesOf({ scrollLeft: 0, scrollWidth: 330, clientWidth: 220 }), { start: false, end: true })
})

test('hiddenEdgesOf: fades both edges part way through', () => {
  assert.deepEqual(hiddenEdgesOf({ scrollLeft: 50, scrollWidth: 330, clientWidth: 220 }), { start: true, end: true })
})

test('hiddenEdgesOf: fades only the start once scrolled to the end, allowing for sub-pixel scroll widths', () => {
  assert.deepEqual(hiddenEdgesOf({ scrollLeft: 109.5, scrollWidth: 330, clientWidth: 220 }), { start: true, end: false })
})
