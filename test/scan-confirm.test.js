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
  assert.match(copy.changes[0].title, /Sydney \(Gore Hill\)/)
  assert.equal(copy.stays.length, 2)
  assert.match(copy.stays[0].title, /\b42 channels\b/)
  assert.match(copy.stays[1].title, /Live TV and recordings/)
  assert.match(copy.note, /few minutes/)
  assert.equal(copy.noteIcon, 'clock')
})

test('scanConfirmOf: a new transmitter is added as a new network, and a recording adds a warning', () => {
  const copy = scanConfirmOf({ networkName: 'Newcastle', existingNetwork: false, channels: 1, recordingWarning: 'TVHeadend is recording The Block.' })
  assert.match(copy.changes[0].title, /Newcastle.*new TV network/)
  assert.match(copy.stays[0].title, /^The channel you have now/)
  assert.match(copy.note, /few minutes.*TVHeadend is recording The Block\.$/)
  assert.equal(copy.noteIcon, 'warning')
})
