import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAPTION_LINE_DEFAULT,
  CAPTION_LINE_MIN,
  captionLine,
} from '../src/web/caption-line.js'

test('captionLine uses the default when no panel is open', () => {
  assert.equal(captionLine(), CAPTION_LINE_DEFAULT)
  assert.equal(captionLine({ panelHeight: 0, videoHeight: 400 }), CAPTION_LINE_DEFAULT)
  assert.equal(captionLine({ panelHeight: 100, videoHeight: 0 }), CAPTION_LINE_DEFAULT)
})

test('captionLine sits above the panel with a gap', () => {
  assert.equal(captionLine({ panelHeight: 100, videoHeight: 400 }), 72)
})

test('captionLine never drops the default for a short panel', () => {
  assert.equal(captionLine({ panelHeight: 10, videoHeight: 400 }), CAPTION_LINE_DEFAULT)
})

test('captionLine clamps to the minimum for a tall panel', () => {
  assert.equal(captionLine({ panelHeight: 380, videoHeight: 400 }), CAPTION_LINE_MIN)
})
