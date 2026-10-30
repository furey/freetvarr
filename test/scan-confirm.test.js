import { test } from 'node:test'
import assert from 'node:assert/strict'

import { needsScanConfirm, scanConfirmOf } from '../src/web/scan-confirm.js'

test('needsScanConfirm: only when TVHeadend already has channels', () => {
  assert.equal(needsScanConfirm({ channels: 0 }), false)
  assert.equal(needsScanConfirm({ channels: 42 }), true)
})

test('scanConfirmOf: an existing network is scanned again and the channels stay', () => {
  const copy = scanConfirmOf({ networkName: 'Sydney (Gore Hill)', existingNetwork: true, channels: 42 })
  assert.equal(copy.title, 'Scan for channels again?')
  assert.equal(copy.goLabel, 'Scan again')
  assert.equal(copy.danger, false)
  assert.equal(copy.changes[0].title, 'Every frequency of Sydney (Gore Hill)')
  assert.deepEqual(copy.stays.map((line) => line.title), ['The 42 channels you have now', 'Live TV and recordings'])
  assert.equal(copy.note, 'A scan takes a few minutes.')
  assert.equal(copy.noteIcon, 'clock')
})

test('scanConfirmOf: a new transmitter is added as a new network, and a recording adds a warning', () => {
  const copy = scanConfirmOf({ networkName: 'Newcastle', existingNetwork: false, channels: 1, recordingWarning: 'TVHeadend is recording The Block.' })
  assert.equal(copy.changes[0].title, 'Newcastle, as a new TV network')
  assert.equal(copy.stays[0].title, 'The channel you have now')
  assert.equal(copy.note, 'A scan takes a few minutes. TVHeadend is recording The Block.')
  assert.equal(copy.noteIcon, 'warning')
})
