import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SIZE_RULES } from '../src/web/multi-resize.js'
import {
  MINI_RULE,
  MINI_GRIP_CORNER,
  MINI_DEFAULT_WIDTH,
  MINI_MIN_WIDTH,
  miniWidthOf,
  miniWidthAfterDrag,
  miniShareOfWidth,
  miniShareAfterKey,
  miniLabelOf,
  parseMiniShare,
  miniShareToStore,
} from '../src/web/mini-resize.js'

const desktop = 1440

test('the Miniplayer uses the size limits of the small picture in big and small', () => {
  assert.equal(MINI_RULE, SIZE_RULES.inset)
  assert.equal(MINI_RULE.min, 0.2)
  assert.equal(MINI_RULE.max, 0.45)
})

test('the grip sits on the corner that faces the middle of the screen', () => {
  assert.equal(MINI_GRIP_CORNER, 'top-left')
})

test('an unset size keeps the default card width', () => {
  assert.equal(miniWidthOf({ share: null, viewportWidth: desktop }), MINI_DEFAULT_WIDTH)
})

test('the width stays between 20% and 45% of the screen', () => {
  assert.equal(miniWidthOf({ share: 0.1, viewportWidth: desktop }), 288)
  assert.equal(miniWidthOf({ share: 0.9, viewportWidth: desktop }), 648)
  assert.equal(miniWidthOf({ share: 0.3, viewportWidth: desktop }), 432)
})

test('a narrow tablet keeps room for the controls', () => {
  assert.equal(miniWidthOf({ share: 0.2, viewportWidth: 768 }), MINI_MIN_WIDTH)
})

test('dragging the grip up and left enlarges the card, and down and right shrinks it', () => {
  const grown = miniWidthAfterDrag({ startWidth: 360, dx: -160, dy: -90, viewportWidth: desktop })
  const shrunk = miniWidthAfterDrag({ startWidth: 360, dx: 40, dy: 22, viewportWidth: desktop })
  assert.equal(grown, 520)
  assert.ok(shrunk < 360)
})

test('dragging past the limits stops at them', () => {
  assert.equal(miniWidthAfterDrag({ startWidth: 360, dx: -2000, dy: -1200, viewportWidth: desktop }), 648)
  assert.equal(miniWidthAfterDrag({ startWidth: 360, dx: 2000, dy: 1200, viewportWidth: desktop }), 288)
})

test('keys step the size, jump to the limits, and reset', () => {
  const step = miniShareAfterKey({ width: 360, viewportWidth: desktop, key: 'ArrowRight' })
  assert.ok(step.share > 0.25)
  assert.deepEqual(miniShareAfterKey({ width: 360, viewportWidth: desktop, key: 'Home' }), { share: 0.2 })
  assert.deepEqual(miniShareAfterKey({ width: 360, viewportWidth: desktop, key: 'End' }), { share: 0.45 })
  assert.deepEqual(miniShareAfterKey({ width: 360, viewportWidth: desktop, key: 'Enter' }), { reset: true })
  assert.equal(miniShareAfterKey({ width: 360, viewportWidth: desktop, key: 'a' }), null)
})

test('the chip shows the width as a share of the screen', () => {
  assert.equal(miniShareOfWidth({ width: 360, viewportWidth: desktop }), 0.25)
  assert.equal(miniLabelOf({ width: 576, viewportWidth: desktop }), '40% wide')
})

test('a stored size is read back clamped, and junk reads as unset', () => {
  assert.equal(parseMiniShare('0.35'), 0.35)
  assert.equal(parseMiniShare('0.9'), 0.45)
  assert.equal(parseMiniShare('0.01'), 0.2)
  assert.equal(parseMiniShare('abc'), null)
  assert.equal(parseMiniShare(null), null)
  assert.equal(parseMiniShare(''), null)
})

test('a size is stored rounded, and an unset size stores nothing', () => {
  assert.equal(miniShareToStore({ share: 0.35467 }), '0.355')
  assert.equal(miniShareToStore({ share: null }), null)
})
