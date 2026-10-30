import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logoWidthOf } from '../src/web/channel-logo-width.js'

test('logoWidthOf: picks the smallest width that covers the rendered pixels', () => {
  assert.equal(logoWidthOf({ cssPx: 36, dpr: 1 }), 96)
  assert.equal(logoWidthOf({ cssPx: 36, dpr: 2 }), 96)
  assert.equal(logoWidthOf({ cssPx: 36, dpr: 3 }), 192)
  assert.equal(logoWidthOf({ cssPx: 96, dpr: 2 }), 192)
})

test('logoWidthOf: caps at the widest width and treats a missing ratio as 1', () => {
  assert.equal(logoWidthOf({ cssPx: 96, dpr: 4 }), 192)
  assert.equal(logoWidthOf({ cssPx: 36, dpr: undefined }), 96)
})
