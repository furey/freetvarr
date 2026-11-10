import { test } from 'node:test'
import assert from 'node:assert/strict'

import { broadcastGuideHealthOf } from '../src/broadcast-guide-health.js'
import { broadcastGuideCheck, suggestedFeedsFixOf } from '../src/doctor.js'
import { suggestionsOf } from '../src/guide-sources/suggested-feeds.js'

const HOUR = 60 * 60_000
const NOW = Date.parse('2026-11-10T00:00:00Z')

const listingsFor = ({ hours, describe = true }) => Array.from({ length: hours }, (_, index) => ({
  start: NOW + index * HOUR,
  end: NOW + (index + 1) * HOUR,
  title: `Show ${index}`,
  synopsis: describe ? 'A show.' : '',
}))

const guideOf = (channelHours) => ({
  channels: channelHours.map((_, index) => ({ epgId: `ch${index}` })),
  programsByChannel: Object.fromEntries(channelHours.map((hours, index) => [`ch${index}`, hours ? listingsFor({ hours }) : []])),
})

test('broadcast guide health: counts listed channels and the median days ahead from TVHeadend events', () => {
  const health = broadcastGuideHealthOf({ guide: guideOf([7 * 24, 8 * 24, 6 * 24, 0]), nowMs: NOW })
  assert.equal(health.channels, 4)
  assert.equal(health.listed, 3)
  assert.equal(health.horizonDays, 7)
  assert.equal(health.coveredShare, 0.8)
  assert.equal(health.describedShare, 1)
  assert.equal(health.short, false)
})

test('broadcast guide health: short when under half the channels have listings or the median is under 3 days', () => {
  assert.equal(broadcastGuideHealthOf({ guide: guideOf([7 * 24, 0, 0]), nowMs: NOW }).short, true)
  assert.equal(broadcastGuideHealthOf({ guide: guideOf([48, 48, 60]), nowMs: NOW }).short, true)
  assert.equal(broadcastGuideHealthOf({ guide: { channels: [] }, nowMs: NOW }), null)
})

test('guide.sources without a listings source: passes on a full EIT guide and points at the third-party feeds', () => {
  const suggestions = suggestionsOf({ country: 'uk', timeZone: 'Europe/London' })
  const result = broadcastGuideCheck({ broadcast: broadcastGuideHealthOf({ guide: guideOf([7 * 24, 7 * 24]), nowMs: NOW }), suggestions })
  assert.equal(result.status, 'pass')
  assert.match(result.detail, /no listings source for the United Kingdom/)
  assert.match(result.detail, /2 of 2 channels have listings for the next 48 h, and the guide runs a median 7 days ahead/)
  assert.match(result.detail, /SETTINGS → GUIDE lists third-party XMLTV feeds for the United Kingdom/)
})

test('guide.sources without a listings source: warns on a short guide with a fix that names a feed and its licence status', () => {
  const suggestions = suggestionsOf({ country: 'de', timeZone: 'Europe/Berlin' })
  const result = broadcastGuideCheck({ broadcast: broadcastGuideHealthOf({ guide: guideOf([24, 0, 0]), nowMs: NOW }), suggestions })
  assert.equal(result.status, 'warn')
  assert.match(result.fix, /^SETTINGS → GUIDE lists XMLTV feeds for Germany, such as https:\/\/epgshare01\.online\/epgshare01\/epg_ripper_DE1\.xml\.gz/)
  assert.match(result.fix, /third-party, licence not checked by Freetvarr/)
  assert.equal(result.action.href, '#/settings/guide')
  assert.equal(broadcastGuideCheck({ broadcast: null, suggestions }).status, 'skip')
  assert.match(suggestedFeedsFixOf({ country: null, feeds: [] }), /XMLTV URL grabber/)
})
