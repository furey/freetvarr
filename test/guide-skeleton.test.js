import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GUIDE_SKELETON_ROWS, guideSkeletonRows } from '../src/web/guide-skeleton.js'

test('guideSkeletonRows: rows of cells that span the track edge to edge', () => {
  const rows = guideSkeletonRows()
  assert.equal(rows.length, GUIDE_SKELETON_ROWS)
  assert.deepEqual(rows[0], [
    { left: '0%', width: '27.27%' },
    { left: '27.27%', width: '18.18%' },
    { left: '45.45%', width: '36.36%' },
    { left: '81.82%', width: '18.18%' },
  ])
})

test('guideSkeletonRows: small zoom shows more, shorter cells and large zoom fewer', () => {
  assert.equal(guideSkeletonRows({ count: 1, zoom: 's' })[0].length, 7)
  assert.equal(guideSkeletonRows({ count: 1, zoom: 'l' })[0].length, 2)
})
