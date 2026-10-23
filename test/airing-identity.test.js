import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  airingCoverCheckOf,
  airingIdentityOf,
  coveredProgrammeIdsOf,
  isPreferredAiring,
  preferredAiringsOf,
  twinAnnotationOf,
} from '../src/airing-identity.js'
import { autorecMatchFieldsOf, autorecMatchesAiring, escapeAutorecTitle, literalTitleOf } from '../src/autorec-match.js'
import { orderChannels } from '../src/channel-order.js'
import { twinCoverOf } from '../src/web/programme-state.js'
import { timeshiftOf } from '../src/web/simulcast.js'

const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000
const START = Date.parse('2026-10-27T19:30:00+11:00')
const NOW = START - 2 * HOUR

const lineup = [
  { id: 'ten-hd', name: '10 HD', hd: true },
  { id: 'ten-sd', name: '10', hd: false },
  { id: 'ten-plus', name: '10 HD +1', hd: true },
  { id: 'food', name: 'SBS Food', hd: false },
  { id: 'nine-hd', name: '9HD Sydney', hd: true },
]

let nextId = 1
const airing = ({ channel, title = 'Big Brother Australia', start = START, length = HOUR, ...rest }) => ({
  program_id: nextId++,
  channel_id: channel,
  title,
  start,
  end: start + length,
  series_link: `${channel}|${title.toLowerCase()}`,
  ...rest,
})

const identityWith = ({ programmes, prefs = {} }) =>
  airingIdentityOf({ programmes, channels: orderChannels({ channels: lineup, ...prefs }) })

const preferredChannels = ({ programmes, prefs, nowMs = NOW }) =>
  preferredAiringsOf({ identity: identityWith({ programmes, prefs }), nowMs }).map((a) => a.channel.id).sort()

test('timeshiftOf reads +1 channels in either spacing', () => {
  assert.deepEqual(timeshiftOf('10 HD +1'), { baseKey: '10', offsetMs: HOUR })
  assert.deepEqual(timeshiftOf('10 HD+1'), { baseKey: '10', offsetMs: HOUR })
  assert.equal(timeshiftOf('10 HD'), null)
})

test('twin airings within a minute on a simulcast pair form one group', () => {
  const hd = airing({ channel: 'ten-hd' })
  const sd = airing({ channel: 'ten-sd', start: START + 30 * 1000 })
  const identity = identityWith({ programmes: [hd, sd] })
  assert.equal(identity.groups.length, 1)
  assert.equal(identity.groupOf(sd), identity.groupOf(hd))
  assert.deepEqual(identity.twinsOf(sd).map((a) => a.channel.id), ['ten-hd'])
})

test('airings more than a minute apart, or with different titles, stay separate', () => {
  const hd = airing({ channel: 'ten-hd' })
  const late = airing({ channel: 'ten-sd', start: START + 2 * MINUTE })
  const news = airing({ channel: 'ten-sd', title: 'Ten News Sydney' })
  const regional = airing({ channel: 'ten-hd', title: 'Ten News Sydney', start: START + HOUR })
  assert.equal(identityWith({ programmes: [hd, late] }).groups.length, 2)
  assert.equal(identityWith({ programmes: [hd, news, regional] }).groups.length, 3)
})

test('the preferred airing is the visible HD twin', () => {
  const programmes = [airing({ channel: 'ten-sd' }), airing({ channel: 'ten-hd' })]
  assert.deepEqual(preferredChannels({ programmes }), ['ten-hd'])
})

test('an SD twin is preferred when its HD twin is hidden', () => {
  const programmes = [airing({ channel: 'ten-sd' }), airing({ channel: 'ten-hd' })]
  assert.deepEqual(preferredChannels({ programmes, prefs: { hiddenIds: ['ten-hd'] } }), ['ten-sd'])
})

test('hide SD simulcasts drops the SD twin but keeps SD-only channels', () => {
  const programmes = [airing({ channel: 'ten-sd' }), airing({ channel: 'ten-hd' }), airing({ channel: 'food', title: 'My Market Kitchen' })]
  assert.deepEqual(preferredChannels({ programmes, prefs: { hideSdSimulcasts: true } }), ['food', 'ten-hd'])
})

test('hide SD channels drops every SD airing, SD-only channels included', () => {
  const programmes = [airing({ channel: 'ten-sd' }), airing({ channel: 'ten-hd' }), airing({ channel: 'food', title: 'My Market Kitchen' })]
  assert.deepEqual(preferredChannels({ programmes, prefs: { hideSdChannels: true } }), ['ten-hd'])
})

test('a pinned HD channel wins inside a group, but a pinned SD twin never beats HD', () => {
  const sevens = [
    { id: 'seven-hd', name: '7HD Sydney', hd: true },
    { id: 'seven-hd-2', name: '7 HD Sydney', hd: true },
    { id: 'seven-sd', name: '7 Sydney', hd: false },
  ]
  const programmes = sevens.map((channel) => airing({ channel: channel.id, title: 'Home and Away' }))
  const pinnedOf = (pinnedIds) => preferredAiringsOf({
    identity: airingIdentityOf({ programmes, channels: orderChannels({ channels: sevens, pinnedIds }) }),
    nowMs: NOW,
  }).map((a) => a.channel.id)
  assert.deepEqual(pinnedOf([]), ['seven-hd'])
  assert.deepEqual(pinnedOf(['seven-hd-2']), ['seven-hd-2'])
  assert.deepEqual(pinnedOf(['seven-sd']), ['seven-hd'])
})

test('a +1 airing joins its original and shows only once the original has passed or is hidden', () => {
  const original = airing({ channel: 'ten-hd' })
  const later = airing({ channel: 'ten-plus', start: START + HOUR })
  const identity = identityWith({ programmes: [original, later] })
  assert.equal(identity.groups.length, 1)
  assert.deepEqual(identity.twinsOf(later), [])
  assert.equal(isPreferredAiring({ identity, programme: original, nowMs: NOW }), true)
  assert.equal(isPreferredAiring({ identity, programme: later, nowMs: NOW }), false)
  assert.equal(isPreferredAiring({ identity, programme: later, nowMs: START + HOUR + MINUTE }), true)
  const hidden = identityWith({ programmes: [original, later], prefs: { hiddenIds: ['ten-hd', 'ten-sd'] } })
  assert.equal(isPreferredAiring({ identity: hidden, programme: later, nowMs: NOW }), true)
})

test('a DVR entry on any twin covers the whole group, +1 included', () => {
  const hd = airing({ channel: 'ten-hd', dvr_state: 'scheduled' })
  const sd = airing({ channel: 'ten-sd' })
  const later = airing({ channel: 'ten-plus', start: START + HOUR })
  const other = airing({ channel: 'nine-hd', title: 'Tipping Point' })
  const identity = identityWith({ programmes: [hd, sd, later, other] })
  const covered = coveredProgrammeIdsOf({ identity, isCovered: airingCoverCheckOf({}) })
  assert.deepEqual([...covered].sort(), [hd, sd, later].map((p) => String(p.program_id)).sort())
})

test('a scheduled programme id or a rule on the SD twin covers the HD twin', () => {
  const hd = airing({ channel: 'ten-hd' })
  const sd = airing({ channel: 'ten-sd' })
  const identity = identityWith({ programmes: [hd, sd] })
  const bySchedule = coveredProgrammeIdsOf({ identity, isCovered: airingCoverCheckOf({ scheduledProgramIds: new Set([sd.program_id]) }) })
  assert.equal(bySchedule.has(String(hd.program_id)), true)
  const rule = autorecOf({ title: 'Big Brother', channel: 'ten-sd' })
  const byRule = coveredProgrammeIdsOf({ identity, isCovered: airingCoverCheckOf({ autorecs: [rule] }) })
  assert.equal(byRule.has(String(hd.program_id)), true)
  assert.equal(twinAnnotationOf({ identity, programme: hd, autorecs: [rule] }).rule_link, rule.seriesLinkId)
})

const autorecOf = ({ channel = '', enabled = true, ...raw }) => ({
  id: `rule-${raw.title}`,
  seriesLinkId: `${channel}|${(raw.title || '').toLowerCase()}`,
  channelId: channel,
  enabled,
  match: autorecMatchFieldsOf({ weekdays: [1, 2, 3, 4, 5, 6, 7], start: 'Any', start_window: 'Any', ...raw }),
})

test('rule titles match as a caseless, unanchored regex, like TVHeadend', () => {
  const programme = airing({ channel: 'ten-hd' })
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'big brother' }), programme }), true)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: '^Big Brother$' }), programme }), false)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'Big Brother', channel: 'ten-sd' }), programme }), false)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'Big Brother', enabled: false }), programme }), false)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: '(' }), programme }), false)
})

test('escaped rule titles match the guide title as plain text', () => {
  const programme = airing({ channel: 'ten-hd', title: 'Who Wants To Be A Millionaire? (2026)' })
  const title = escapeAutorecTitle('Who Wants To Be A Millionaire? (2026)')
  assert.equal(title, 'Who Wants To Be A Millionaire\\? \\(2026\\)')
  assert.equal(literalTitleOf(title), 'Who Wants To Be A Millionaire? (2026)')
  assert.equal(literalTitleOf('Doctor Who|Torchwood'), null)
  assert.equal(literalTitleOf('Mr\\d'), null)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title }), programme }), true)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title }), programme: { ...programme, title: 'Who Wants To Be A Millionair (2026)' } }), false)
})

test('typed regex rules keep their regex meaning, and backtracking patterns never run', () => {
  const programme = airing({ channel: 'ten-hd', title: 'a'.repeat(400) })
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: '^a+$' }), programme }), true)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: '.*a.*' }), programme }), true)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: '^(?:The |x)?a{3}' }), programme }), true)
  const startedAt = performance.now()
  for (const title of ['(a+)+$', '(a|aa)*$', '(\\w+\\s?)+$', 'a*a*a*b', '.*.*.*b', '(a)\\1+b', 'a{1,100}a{1,100}b']) {
    assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title }), programme: { ...programme, title: `${'a'.repeat(400)}!` } }), false, title)
  }
  assert.ok(performance.now() - startedAt < 200)
})

test('fulltext rules also search the episode title and synopsis', () => {
  const programme = airing({ channel: 'ten-hd', synopsis: 'Housemates face the jury.' })
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'jury' }), programme }), false)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'jury', fulltext: true }), programme }), true)
})

test('rules check weekdays, start window, and duration', () => {
  const programme = airing({ channel: 'ten-hd' })
  const startDate = new Date(programme.start)
  const weekday = ((startDate.getDay() + 6) % 7) + 1
  const clock = (offsetMinutes) => {
    const at = new Date(programme.start + offsetMinutes * MINUTE)
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  }
  const other = [1, 2, 3, 4, 5, 6, 7].filter((day) => day !== weekday)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'Big', weekdays: other }), programme }), false)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'Big', weekdays: [weekday] }), programme }), true)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'Big', start: clock(-10), start_window: clock(10) }), programme }), true)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'Big', start: clock(10), start_window: clock(20) }), programme }), false)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'Big', minduration: 2 * 3600 }), programme }), false)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'Big', maxduration: 1800 }), programme }), false)
})

test('rules with conditions Freetvarr cannot read never claim a match', () => {
  const programme = airing({ channel: 'ten-hd' })
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ title: 'Big', content_type: 4 }), programme }), false)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({ serieslink: 'crid://x' }), programme: { ...programme, serieslink_uri: 'crid://x' } }), true)
  assert.equal(autorecMatchesAiring({ autorec: autorecOf({}), programme }), false)
})

test('a client twin cover reads the twin scheduled in TVHeadend', () => {
  const programme = { program_id: 2, twins: [{ program_id: 1, channel_name: '10 HD', series_link: 'ten-hd|big brother' }] }
  const cover = twinCoverOf({
    programme,
    scheduledByProgramId: new Map([['1', { programId: 1 }]]),
    activeRecordingSet: new Set(),
    seriesLinks: new Set(),
  })
  assert.equal(cover.state, 'scheduled')
  assert.equal(cover.twin.channel_name, '10 HD')
  assert.equal(twinCoverOf({ programme: { ...programme, past: true }, scheduledByProgramId: new Map([['1', {}]]), activeRecordingSet: new Set(), seriesLinks: new Set() }), null)
})
