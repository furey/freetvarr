import { test } from 'node:test'
import assert from 'node:assert/strict'

import { recordOptionsFrom } from '../src/recording-padding.js'

const PADDING_ERROR = 'lead_time and lag_time must be whole numbers of minutes from 0 to 240'

test('recordOptionsFrom: rejects padding outside whole minutes from 0 to 240', () => {
  for (const bad of [241, -5, 2.5, 'abc']) {
    assert.deepEqual(recordOptionsFrom({ lead_time: bad }), { error: PADDING_ERROR })
    assert.deepEqual(recordOptionsFrom({ lag_time: bad }), { error: PADDING_ERROR })
  }
})

test('recordOptionsFrom: passes 0, 5, and 240 through as numbers', () => {
  for (const good of [0, 5, 240, '5']) {
    assert.deepEqual(recordOptionsFrom({ lead_time: good, lag_time: good }), {
      options: { leadTime: Number(good), lagTime: Number(good) },
    })
  }
})

test('recordOptionsFrom: omitted or empty values keep the TVHeadend defaults', () => {
  assert.deepEqual(recordOptionsFrom({}), { options: {} })
  assert.deepEqual(recordOptionsFrom({ lead_time: '', lag_time: null }), { options: {} })
})

test('recordOptionsFrom: episodes_to_keep is a whole number from 0 to 999', () => {
  assert.deepEqual(recordOptionsFrom({ episodes_to_keep: 0 }), { options: { episodesToKeep: 0 } })
  assert.deepEqual(recordOptionsFrom({ episodes_to_keep: 999 }), { options: { episodesToKeep: 999 } })
  for (const bad of [1000, -1, 2.5, 'abc']) {
    assert.deepEqual(recordOptionsFrom({ episodes_to_keep: bad }), {
      error: 'episodes_to_keep must be a whole number from 0 to 999',
    })
  }
})
