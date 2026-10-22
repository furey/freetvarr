import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  SHEET_DRAG_SLOP_PX,
  SHEET_MAX_LIFT_PX,
  releaseVelocityOf,
  sheetDragOffsetOf,
  sheetDragStartOf,
  sheetReleaseOf,
} from '../src/web/sheet-drag.js'

test('sheetReleaseOf closes past a quarter of the sheet height and snaps back short of it', () => {
  assert.equal(sheetReleaseOf({ offset: 100, height: 400, velocity: 0 }), 'close')
  assert.equal(sheetReleaseOf({ offset: 99, height: 400, velocity: 0 }), 'stay')
  assert.equal(sheetReleaseOf({ offset: 0, height: 0, velocity: 0 }), 'stay')
})

test('sheetReleaseOf closes on a downward fling and stays on an upward one', () => {
  assert.equal(sheetReleaseOf({ offset: 30, height: 600, velocity: 0.8 }), 'close')
  assert.equal(sheetReleaseOf({ offset: 0, height: 600, velocity: 0.8 }), 'stay')
  assert.equal(sheetReleaseOf({ offset: 300, height: 600, velocity: -0.8 }), 'stay')
  assert.equal(sheetReleaseOf({ offset: 30, height: 600, velocity: 0.2 }), 'stay')
})

test('sheetDragStartOf waits for the slop, then drags from the handle in either direction', () => {
  assert.equal(sheetDragStartOf({ dx: 0, dy: SHEET_DRAG_SLOP_PX - 1, fromHandle: true, scrolledFromTop: false }), 'wait')
  assert.equal(sheetDragStartOf({ dx: 0, dy: 10, fromHandle: true, scrolledFromTop: true }), 'drag')
  assert.equal(sheetDragStartOf({ dx: 0, dy: -10, fromHandle: true, scrolledFromTop: false }), 'drag')
  assert.equal(sheetDragStartOf({ dx: 20, dy: 10, fromHandle: true, scrolledFromTop: false }), 'ignore')
})

test('sheetDragStartOf drags from content only downward at the top of the scroll', () => {
  assert.equal(sheetDragStartOf({ dx: 2, dy: 12, fromHandle: false, scrolledFromTop: false }), 'drag')
  assert.equal(sheetDragStartOf({ dx: 2, dy: 12, fromHandle: false, scrolledFromTop: true }), 'ignore')
  assert.equal(sheetDragStartOf({ dx: 2, dy: -12, fromHandle: false, scrolledFromTop: false }), 'ignore')
  assert.equal(sheetDragStartOf({ dx: 30, dy: 12, fromHandle: false, scrolledFromTop: false }), 'ignore')
})

test('sheetDragOffsetOf follows a downward drag and resists an upward one', () => {
  assert.equal(sheetDragOffsetOf(120), 120)
  assert.equal(sheetDragOffsetOf(-20), -5)
  assert.equal(sheetDragOffsetOf(-400), -SHEET_MAX_LIFT_PX)
})

test('releaseVelocityOf measures the last 100 ms of movement', () => {
  assert.equal(releaseVelocityOf([]), 0)
  assert.equal(releaseVelocityOf([{ y: 10, at: 0 }]), 0)
  assert.equal(releaseVelocityOf([{ y: 0, at: 0 }, { y: 400, at: 900 }, { y: 450, at: 950 }, { y: 500, at: 1000 }]), 1)
})

test('every sheet grab is a Close button wired to the shared drag', async () => {
  const files = ['ui-sheet.js', 'programme-sheet-host.js', 'channels-modal.js']
  for (const file of files) {
    const source = await fs.readFile(new URL(`../src/web/components/${file}`, import.meta.url), 'utf8')
    const grabs = source.match(/<[a-z]+[^>]*class="ui-sheet-grab"[^>]*>/g) ?? []
    assert.ok(grabs.length > 0, file)
    grabs.forEach((grab) => {
      assert.match(grab, /^<button type="button"/, file)
      assert.match(grab, /aria-label="Close"/, file)
      assert.match(grab, /@click="[a-zA-Z]*[dD]rag\.onHandleClick"/, file)
    })
    assert.match(source, /useSheetDrag\(/, file)
  }
})
