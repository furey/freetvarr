import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  badgeOf,
  cardMetaOf,
  chooserShownOf,
  CHOOSER_SNOOZE_MS,
  doneLabelOf,
  feedbackOf,
  forYouSlideOf,
  guideHandoffOf,
  hiddenToastOf,
  historyClearCopyOf,
  homeRowOf,
  isScheduled,
  liveProgressOf,
  menuOf,
  msOf,
  pageIntroOf,
  reasonOf,
  scheduledKeysOf,
  sectionsOf,
  sheetFocusOf,
  shownBatchesOf,
  tapActionOf,
  tierReasonOf,
  tierSummaryOf,
  whyRowsOf,
} from '../src/web/for-you.js'

const timeZone = 'UTC'
const nowMs = Date.parse('2026-10-19T19:14:00Z')
const MIN = 60_000
const DAY = 86_400_000

const item = (over) => ({
  id: 'e1', programmeKey: 'abc|grand-designs-australia|1', seriesKey: 'grand-designs-australia',
  title: 'Grand Designs Australia', episodeTitle: 'Brunswick', synopsis: '', image: null, channelId: 'c2',
  channelName: 'ABC TV', start: nowMs + 2 * DAY + 16 * MIN, stop: nowMs + 2 * DAY + 76 * MIN, onNow: false,
  kind: 'new-season', reason: 'Because you watch The Block', score: 0.9, canRecordSeries: true, ...over,
})

const payload = (over) => ({
  tier: 'standard',
  coldStart: false,
  generatedAt: nowMs,
  sections: [
    { key: 'might-like', title: 'You might like', items: [item({ id: 'e3', seriesKey: 'market-stories', title: 'Market Stories', kind: 'similar', reason: 'Similar to Chefs Ahoy' })] },
    { key: 'coming-up', title: 'Coming up this week for you', items: [item(), item({ id: 'e2', seriesKey: 'big-wave-season', title: 'Big Wave Season', onNow: true, start: nowMs - 20 * MIN, stop: nowMs + 52 * MIN, kind: 'liked', reason: 'You often watch 7mate at 7 pm', channelName: '7mate', channelId: 'c7' })] },
    { key: 'movies', title: 'Movies for you', items: [item({ id: 'm1', seriesKey: 'the-long-swim', title: 'The Long Swim', kind: 'movie', reason: '' })] },
    { key: 'new-seasons', title: 'New seasons and returning', items: [item({ id: 'dup', reason: 'New season of a show you finished' })] },
  ],
  ...over,
})

test('msOf: accepts epoch milliseconds or seconds and rejects junk', () => {
  assert.equal(msOf(nowMs), nowMs)
  assert.equal(msOf(nowMs / 1000), nowMs)
  assert.equal(msOf(null), null)
  assert.equal(msOf('soon'), null)
})

test('sectionsOf: orders sections, drops empty ones, and shows each show in one section only', () => {
  const sections = sectionsOf({ payload: payload() })
  assert.deepEqual(sections.map((s) => s.key), ['coming-up', 'might-like', 'movies'])
  assert.equal(sections[0].sortedByAirTime, true)
  assert.deepEqual(sections[2].rows.map((row) => row.shape), ['poster'])
})

test('sectionsOf: hidden shows drop out and scheduled picks move to the end of their row', () => {
  const scheduledKeys = scheduledKeysOf([{ channelId: 'c2', startDate: nowMs + 2 * DAY + 16 * MIN }])
  const sections = sectionsOf({ payload: payload(), scheduledKeys, hiddenKeys: new Set(['market-stories']) })
  assert.deepEqual(sections.map((s) => s.key), ['coming-up', 'movies'])
  assert.deepEqual(sections[0].rows[0].items.map((i) => i.id), ['e2', 'e1'])
  assert.equal(isScheduled({ item: item(), scheduledKeys }), true)
})

test('sectionsOf: a cold-start section splits into a wide row and a poster row', () => {
  const cold = { coldStart: true, sections: [{ key: 'premieres', title: '', items: [item({ kind: 'premiere' }), item({ id: 'm1', seriesKey: 'harvest-moon', title: 'Harvest Moon', kind: 'movie' })] }] }
  const [section] = sectionsOf({ payload: cold })
  assert.equal(section.title, 'Premieres and movies this week')
  assert.deepEqual(section.rows.map((row) => row.shape), ['card', 'poster'])
})

test('homeRowOf: For you row without movies, titled New this week until suggestions start, hidden when off or empty', () => {
  const row = homeRowOf({ payload: payload() })
  assert.equal(row.title, 'For you')
  assert.deepEqual(row.items.map((i) => i.id), ['e1', 'e2', 'e3'])
  assert.equal(homeRowOf({ payload: payload({ coldStart: true }) }).title, 'New this week')
  assert.equal(homeRowOf({ payload: null }), null)
  assert.equal(homeRowOf({ payload: payload({ enabled: false }) }), null)
  assert.equal(homeRowOf({ payload: payload({ sections: [] }) }), null)
})

test('badgeOf: Recording beats LIVE beats the kind badge, and plain picks have none', () => {
  assert.deepEqual(badgeOf({ item: item(), scheduled: true }), { label: 'Recording', tone: 'rec' })
  assert.deepEqual(badgeOf({ item: item({ onNow: true }) }), { label: 'LIVE', tone: 'live' })
  assert.deepEqual(badgeOf({ item: item({ kind: 'returning' }) }), { label: 'Returning', tone: 'plain' })
  assert.deepEqual(badgeOf({ item: item({ kind: 'PREMIERE' }) }), { label: 'Premiere', tone: 'plain' })
  assert.equal(badgeOf({ item: item({ kind: 'similar' }) }), null)
})

test('cardMetaOf: when and where, with the kind as a lead on Home, and minutes left when on now', () => {
  assert.equal(cardMetaOf({ item: item(), nowMs, timeZone }), 'Wed 7:30pm · ABC TV')
  assert.equal(cardMetaOf({ item: item(), nowMs, timeZone, withLead: true }), 'New season · Wed 7:30pm · ABC TV')
  const live = item({ onNow: true, channelName: '7mate', start: nowMs - 20 * MIN, stop: nowMs + 52 * MIN })
  assert.equal(cardMetaOf({ item: live, nowMs, timeZone }), 'On now · 7mate · 52 min left')
  assert.equal(liveProgressOf({ item: live, nowMs }), 28)
  assert.equal(liveProgressOf({ item: item(), nowMs }), null)
})

test('reasonOf: the server reason wins, with plain fallbacks for movies and premieres', () => {
  assert.equal(reasonOf(item()), 'Because you watch The Block')
  assert.equal(reasonOf(item({ reason: '', kind: 'movie', stop: nowMs + 2 * DAY + 126 * MIN })), 'Movie · 1 h 50 min')
  assert.equal(reasonOf(item({ reason: '', kind: 'premiere' })), 'New show this week')
  assert.equal(reasonOf(item({ reason: '', kind: 'similar' })), '')
})

test('tapActionOf: scheduled opens the show, on now watches, kinds pick the sheet strength', () => {
  assert.equal(tapActionOf({ item: item(), scheduled: true }), 'show')
  assert.equal(tapActionOf({ item: item({ onNow: true }) }), 'watch-live')
  assert.equal(tapActionOf({ item: item() }), 'record-series')
  assert.equal(tapActionOf({ item: item({ canRecordSeries: false }) }), 'record-episode')
  assert.equal(tapActionOf({ item: item({ kind: 'premiere' }) }), 'notify')
  assert.equal(tapActionOf({ item: item({ kind: 'movie' }) }), 'record-episode')
  assert.equal(sheetFocusOf('record-series'), 'series')
  assert.equal(sheetFocusOf('notify'), 'notify')
  assert.equal(sheetFocusOf('watch-live'), '')
})

test('menuOf: Watch live only while on, record actions until scheduled, and the show name in Not interested', () => {
  const onNow = menuOf({ item: item({ onNow: true, channelName: '7mate' }), nowMs, timeZone })
  assert.deepEqual(onNow.actions.map((a) => a.key), ['watch-live', 'record-episode', 'record-series', 'notify'])
  assert.equal(onNow.actions[1].detail, 'From now')
  const later = menuOf({ item: item({ canRecordSeries: false }), nowMs, timeZone })
  assert.deepEqual(later.actions.map((a) => a.key), ['record-episode', 'notify'])
  assert.equal(later.actions[0].detail, 'Wed 7:30pm')
  assert.deepEqual(menuOf({ item: item(), scheduled: true, nowMs, timeZone }).actions.map((a) => a.key), ['show', 'notify'])
  assert.deepEqual(later.more.map((a) => a.label), ['Not interested in Grand Designs Australia', 'Why this?'])
})

test('guideHandoffOf: opens the programme on its guide day with the right strength', () => {
  const handoff = guideHandoffOf({ item: item(), action: 'record-series', nowMs, timeZone, returnTo: '#/for-you' })
  assert.equal(handoff.dayOffset, 2)
  assert.equal(handoff.focus, 'series')
  assert.equal(handoff.channelId, 'c2')
  assert.equal(handoff.program.program_id, 'e1')
  assert.equal(handoff.program.start, item().start)
  assert.equal(handoff.returnTo, '#/for-you')
})

test('feedbackOf and shownBatchesOf: events the feedback endpoint accepts, in batches of up to 50', () => {
  assert.deepEqual(feedbackOf({ kind: 'thumb_up', item: item(), source: 'home' }), {
    kind: 'thumb_up', series_key: 'grand-designs-australia', title: 'Grand Designs Australia',
    programme_start: item().start, channel_id: 'c2', source: 'home',
  })
  assert.equal(feedbackOf({ kind: 'not_interested', item: item({ seriesKey: null, title: 'Q&A' }), source: 'for-you' }).series_key, 'q-a')
  const items = Array.from({ length: 120 }, (_, i) => item({ id: `e${i}` }))
  const batches = shownBatchesOf({ items, source: 'for-you' })
  assert.deepEqual(batches.map((b) => b.events.length), [50, 50, 20])
  assert.equal(batches[0].events[0].kind, 'suggestion_shown')
})

test('forYouSlideOf: the top unscheduled pick, eyebrow For you · reason, Record series and Details', () => {
  const slide = forYouSlideOf({ payload: payload(), nowMs, timeZone })
  assert.equal(slide.type, 'for-you')
  assert.equal(slide.eyebrowAccent, 'For you')
  assert.equal(slide.eyebrow, 'Because you watch The Block')
  assert.equal(slide.meta, 'New season · Brunswick · Wed 7:30pm · ABC TV')
  assert.deepEqual([slide.primary.action, slide.primary.label], ['record-series', 'Record series'])
  assert.deepEqual([slide.secondary.action, slide.secondary.label], ['guide', 'Details'])
  assert.equal(slide.target.dayOffset, 2)
  const scheduledKeys = scheduledKeysOf([{ channelId: 'c2', startDate: item().start }])
  assert.equal(forYouSlideOf({ payload: payload(), scheduledKeys, nowMs, timeZone }).title, 'Big Wave Season')
  assert.equal(forYouSlideOf({ payload: payload({ coldStart: true }), nowMs, timeZone }), null)
})

test('cold start: page intro, chooser visibility with a 7-day skip, and the Done label', () => {
  assert.match(pageIntroOf({ coldStart: true }), /Suggestions start after you watch a few shows/)
  assert.match(pageIntroOf({ coldStart: false }), /next 7 days of the guide/)
  const pickable = [{ seriesKey: 'the-block', title: 'The Block' }]
  assert.equal(chooserShownOf({ coldStart: true, pickable, nowMs }), true)
  assert.equal(chooserShownOf({ coldStart: false, pickable, nowMs }), false)
  assert.equal(chooserShownOf({ coldStart: true, pickable: [], nowMs }), false)
  assert.equal(chooserShownOf({ coldStart: true, pickable, picked: true, nowMs }), false)
  assert.equal(chooserShownOf({ coldStart: true, pickable, skippedAt: nowMs - DAY, nowMs }), false)
  assert.equal(chooserShownOf({ coldStart: true, pickable, skippedAt: nowMs - CHOOSER_SNOOZE_MS, nowMs }), true)
  assert.equal(doneLabelOf(3), 'Done · 3 picked')
  assert.equal(doneLabelOf(0), 'Done')
})

test('settings copy: level summary, hardware reason, clear-history line, and hidden toast', () => {
  assert.equal(tierSummaryOf({ tier: 'standard', tierOverride: 'auto' }), 'Standard, detected on this box')
  assert.equal(tierSummaryOf({ tier: 'plus', tierOverride: 'plus' }), 'Plus, set by you')
  assert.equal(tierReasonOf({ tierReason: 'About 64 s a day for 510 new texts', probe: {} }), 'About 64 s a day for 510 new texts')
  assert.equal(tierReasonOf({ probe: { cores: 2, memory: { totalMb: 6144 }, arch: 'x64' } }), '2 cores, 6 GB memory, x64')
  assert.match(tierReasonOf({}), /not checked/)
  assert.equal(historyClearCopyOf(214), 'Removes 214 history entries, including your thumbs up and down. Suggestions start again from new.')
  assert.match(historyClearCopyOf(0), /^Removes your viewing history/)
  assert.equal(hiddenToastOf('Grand Designs Australia'), 'Grand Designs Australia is hidden from For you')
})

test('whyRowsOf: strongest reason first, bars relative to it, and an icon by meaning', () => {
  const rows = whyRowsOf({
    reasons: [
      { text: 'You often watch on Wednesday evenings', weight: 0.2 },
      { text: 'You watched 9 of 10 episodes of The Block', weight: 0.8 },
      { text: 'Same genres as The Block', weight: 0.4 },
      { text: '', weight: 1 },
    ],
  })
  assert.deepEqual(rows.map((r) => [r.icon, r.percent]), [['history', 100], ['tag', 50], ['clock', 25]])
  assert.deepEqual(whyRowsOf(null), [])
})
