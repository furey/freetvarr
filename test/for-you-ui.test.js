import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  badgeOf,
  cardMetaOf,
  cardRatingOf,
  chooserShownOf,
  CHOOSER_SNOOZE_MS,
  doneLabelOf,
  feedbackOf,
  programmeOpenedOf,
  forYouSlideOf,
  forYouReadyOf,
  sheetRequestOf,
  hiddenToastOf,
  historyClearCopyOf,
  homeRowOf,
  isScheduled,
  liveProgressOf,
  menuOf,
  programOf,
  movieKindToastOf,
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
  undoneMovieKindToastOf,
  topRatedSlideOf,
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
  kind: 'new-season', reason: 'Because you watched The Block', score: 0.9, canRecordSeries: true, ...over,
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

test('homeRowOf: For you row spread across the page sections, titled New this week until suggestions start, hidden when off or empty', () => {
  const row = homeRowOf({ payload: payload() })
  assert.equal(row.title, 'For you')
  assert.deepEqual(row.items.map((i) => i.id), ['e1', 'e3', 'm1', 'e2'])
  assert.equal(homeRowOf({ payload: payload({ coldStart: true }) }).title, 'New this week')
  assert.equal(homeRowOf({ payload: null }), null)
  assert.equal(homeRowOf({ payload: payload({ enabled: false }) }), null)
  assert.equal(homeRowOf({ payload: payload({ sections: [] }) }), null)
})

const lane = ({ prefix, count, over = {} }) => Array.from({ length: count }, (_, i) => item({
  id: `${prefix}${i + 1}`, seriesKey: `${prefix}-${i + 1}`, title: `${prefix} ${i + 1}`, ...over,
}))

const film = (over) => ({ kind: 'movie', reason: '', rating: { score: 8.1, votes: 9000 }, ...over })

const spreadPayload = (over) => payload({
  sections: [
    { key: 'might-like', title: '', items: lane({ prefix: 'like', count: 10, over: { kind: 'similar' } }) },
    { key: 'top-rated', title: '', items: lane({ prefix: 'top', count: 10, over: film() }) },
    { key: 'movies', title: '', items: lane({ prefix: 'film', count: 10, over: { kind: 'movie', reason: '' } }) },
  ],
  ...over,
})

test('homeRowOf: takes turns between page sections with two top rated films at slots 3 and 7, and no scores', () => {
  const row = homeRowOf({ payload: spreadPayload() })
  assert.deepEqual(row.items.map((i) => i.id), [
    'like1', 'film1', 'top1', 'like2', 'film2', 'like3', 'top2', 'film3', 'like4', 'film4', 'like5', 'film5',
  ])
  assert.equal(row.items.every((i) => !cardRatingOf(i)), true)
  assert.equal(new Set(row.items.map((i) => i.seriesKey)).size, row.items.length)
})

test('homeRowOf: hidden and repeated shows drop out without leaving gaps', () => {
  const base = spreadPayload()
  const sections = base.sections.map((section) => (section.key === 'movies'
    ? { ...section, items: [base.sections[0].items[0], ...section.items] }
    : section))
  const row = homeRowOf({ payload: { ...base, sections }, hiddenKeys: new Set(['top-1', 'like-2']) })
  assert.deepEqual(row.items.slice(0, 8).map((i) => i.id), ['like1', 'film1', 'top2', 'like3', 'film2', 'like4', 'top3', 'film3'])
  assert.equal(new Set(row.items.map((i) => i.id)).size, row.items.length)
})

test('homeRowOf: Films in other languages caps foreign films across the whole Home row', () => {
  const foreign = (section, ids) => ({ ...section, items: section.items.map((i) => (ids.includes(i.id) ? { ...i, otherLanguage: true } : i)) })
  const base = spreadPayload()
  const sections = [base.sections[0], foreign(base.sections[1], ['top1', 'top2']), foreign(base.sections[2], ['film1'])]
  const idsFor = (otherLanguageFilms) => homeRowOf({ payload: { ...base, otherLanguageFilms, sections } }).items.map((i) => i.id)
  assert.deepEqual(idsFor('few').filter((id) => ['top1', 'top2', 'film1'].includes(id)), ['top1', 'top2'])
  assert.deepEqual(idsFor('none').filter((id) => ['top1', 'top2', 'film1'].includes(id)), [])
  assert.deepEqual(idsFor('none').slice(0, 3), ['like1', 'like2', 'top3'])
  assert.deepEqual(idsFor('all').filter((id) => ['top1', 'top2', 'film1'].includes(id)), ['film1', 'top1', 'top2'])
})

test('homeRowOf: few sections or items still fill the row without gaps or repeats', () => {
  const short = payload({ sections: [
    { key: 'might-like', title: '', items: lane({ prefix: 'like', count: 3, over: { kind: 'similar' } }) },
    { key: 'top-rated', title: '', items: lane({ prefix: 'top', count: 5, over: film() }) },
  ] })
  assert.deepEqual(homeRowOf({ payload: short }).items.map((i) => i.id), ['like1', 'like2', 'top1', 'like3', 'top2'])
  const onlyFilms = payload({ sections: [{ key: 'top-rated', title: '', items: lane({ prefix: 'top', count: 5, over: film() }) }] })
  assert.deepEqual(homeRowOf({ payload: onlyFilms }).items.map((i) => i.id), ['top1', 'top2'])
  const noFilms = payload({ sections: [{ key: 'might-like', title: '', items: lane({ prefix: 'like', count: 4, over: { kind: 'similar' } }) }] })
  assert.deepEqual(homeRowOf({ payload: noFilms }).items.map((i) => i.id), ['like1', 'like2', 'like3', 'like4'])
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
  assert.equal(reasonOf(item()), 'Because you watched The Block')
  assert.equal(reasonOf(item({ reason: '', kind: 'movie', stop: nowMs + 2 * DAY + 126 * MIN })), 'Movie · 1 h 50 min')
  assert.equal(reasonOf(item({ reason: '', kind: 'premiere' })), 'New show this week')
  assert.equal(reasonOf(item({ reason: '', kind: 'similar' })), '')
})

test('tapActionOf: scheduled opens the show, on now watches, kinds pick the sheet strength', () => {
  assert.equal(tapActionOf({ item: item(), scheduled: true }), 'show')
  assert.equal(tapActionOf({ item: item({ onNow: true }) }), 'watch-live')
  assert.equal(tapActionOf({ item: item() }), 'record-series')
  assert.equal(tapActionOf({ item: item({ canRecordSeries: false }) }), 'record-episode')
  assert.equal(tapActionOf({ item: item({ kind: 'premiere' }) }), 'record-series')
  assert.equal(tapActionOf({ item: item({ kind: 'premiere', canRecordSeries: false }) }), 'record-episode')
  assert.equal(tapActionOf({ item: item({ kind: 'movie' }) }), 'record-episode')
  assert.equal(sheetFocusOf('record-series'), 'series')
  assert.equal(sheetFocusOf('watch-live'), '')
})

test('menuOf: Watch live only while on, record actions until scheduled, and the show name in Not interested', () => {
  const onNow = menuOf({ item: item({ onNow: true, channelName: '7mate' }), nowMs, timeZone })
  assert.deepEqual(onNow.actions.map((a) => a.key), ['watch-live', 'record-episode', 'record-series', 'programme-info'])
  assert.equal(onNow.actions[1].detail, 'From now')
  const later = menuOf({ item: item({ canRecordSeries: false }), nowMs, timeZone })
  assert.deepEqual(later.actions.map((a) => a.key), ['record-episode', 'programme-info'])
  assert.equal(later.actions[0].detail, 'Wed 7:30pm')
  assert.deepEqual(menuOf({ item: item(), scheduled: true, nowMs, timeZone }).actions.map((a) => a.key), ['show', 'programme-info'])
  assert.deepEqual(later.more.map((a) => a.label), ['Not interested in Grand Designs Australia', 'Why this?'])
})

test('sheetRequestOf: opens the programme sheet on its guide day with the right strength', () => {
  const request = sheetRequestOf({ item: item(), action: 'record-series', nowMs, timeZone })
  assert.equal(request.dayOffset, 2)
  assert.equal(request.focus, 'series')
  assert.equal(request.channelId, 'c2')
  assert.equal(request.programme.program_id, 'e1')
  assert.equal(request.programme.start, item().start)
  assert.equal(request.programme.synopsis, item().synopsis || null)
  assert.equal(request.channelHint.name, item().channelName || '')
})

test('programmeOpenedOf: a sheet open becomes a programme_opened event', () => {
  const programme = { title: 'Harry Brown', start: Date.UTC(2026, 9, 21, 10) }
  assert.deepEqual(programmeOpenedOf({ programme, channelId: 7 }), {
    kind: 'programme_opened',
    series_key: 'harry-brown',
    title: 'Harry Brown',
    programme_start: Date.UTC(2026, 9, 21, 10),
    channel_id: '7',
    source: 'sheet',
  })
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
  assert.equal(slide.eyebrow, 'Because you watched The Block')
  assert.equal(slide.meta, 'New season · Brunswick · Wed 7:30pm · ABC TV')
  assert.deepEqual([slide.primary.action, slide.primary.label], ['record-series', 'Record series'])
  assert.deepEqual([slide.secondary.action, slide.secondary.label], ['guide', 'Details'])
  assert.equal(slide.target.dayOffset, 2)
  const scheduledKeys = scheduledKeysOf([{ channelId: 'c2', startDate: item().start }])
  assert.equal(forYouSlideOf({ payload: payload(), scheduledKeys, nowMs, timeZone }).title, 'Big Wave Season')
  assert.equal(forYouSlideOf({ payload: payload({ coldStart: true }), nowMs, timeZone }), null)
})

const ratedFilm = (over) => item({
  id: 'r1', seriesKey: 'the-pianist', title: 'The Pianist', kind: 'movie', reason: '', canRecordSeries: false,
  image: '/api/epg/image/r1', rating: { score: 8.4, votes: 20000 }, ...over,
})

const ratedPayload = (films, over) => payload({
  sections: [
    ...payload().sections,
    { key: 'top-rated', title: 'Top rated movies this week', items: films },
  ],
  ...over,
})

test('top rated cards: star score line, no reason, the Movies this week when line', () => {
  const film = ratedFilm()
  assert.deepEqual(cardRatingOf(film), { label: '8.4', spoken: 'rated 8.4 out of 10' })
  assert.equal(cardRatingOf(item()), null)
  assert.equal(reasonOf(film), '')
  assert.equal(cardMetaOf({ item: film, nowMs, timeZone }), 'Wed 7:30pm · ABC TV')
  const sections = sectionsOf({ payload: ratedPayload([film]) })
  assert.deepEqual(sections.map((section) => section.key), ['coming-up', 'might-like', 'top-rated', 'movies'])
  assert.equal(sections.find((section) => section.key === 'top-rated').rows[0].shape, 'poster')
})

test('topRatedSlideOf: the best film with a wide picture, eyebrow, Record and Details, never the For you slide', () => {
  const films = [ratedFilm({ id: 'r0', title: 'No Picture', seriesKey: 'no-picture', image: '/api/epg/show-image?title=No%20Picture&kind=movie' }), ratedFilm()]
  const slide = topRatedSlideOf({ payload: ratedPayload(films), nowMs, timeZone })
  assert.equal(slide.type, 'top-rated')
  assert.equal(slide.eyebrow, 'Top rated this week')
  assert.equal(slide.eyebrowAccent, undefined)
  assert.equal(slide.title, 'The Pianist')
  assert.equal(slide.meta, 'Wed 7:30pm · ABC TV')
  assert.deepEqual([slide.primary.action, slide.primary.label], ['record', 'Record'])
  assert.equal(topRatedSlideOf({ payload: ratedPayload([films[0]]), nowMs, timeZone }), null)
  assert.notEqual(forYouSlideOf({ payload: ratedPayload(films), nowMs, timeZone }).type, 'top-rated')
  assert.equal(topRatedSlideOf({ payload: ratedPayload(films), nowMs, timeZone, besides: { target: { item: films[1] } } }), null)
})

test('topRatedSlideOf: with A few, only one hero slide is a film in another language', () => {
  const films = [ratedFilm({ id: 'f1', title: 'Amelie', seriesKey: 'amelie', otherLanguage: true }), ratedFilm()]
  const besides = { target: { item: ratedFilm({ id: 'p1', title: 'Parasite', seriesKey: 'parasite', otherLanguage: true }) } }
  assert.equal(topRatedSlideOf({ payload: ratedPayload(films, { otherLanguageFilms: 'few' }), nowMs, timeZone, besides }).title, 'The Pianist')
  assert.equal(topRatedSlideOf({ payload: ratedPayload(films, { otherLanguageFilms: 'all' }), nowMs, timeZone, besides }).title, 'Amelie')
  assert.equal(topRatedSlideOf({ payload: ratedPayload(films, { otherLanguageFilms: 'few' }), nowMs, timeZone }).title, 'Amelie')
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

test('forYouReadyOf: ready once the suggestions leave cold start and For you is on', () => {
  assert.equal(forYouReadyOf({ settings: { enabled: true }, payload: payload({ coldStart: false }) }), true)
  assert.equal(forYouReadyOf({ settings: { enabled: true }, payload: payload({ coldStart: true }) }), false)
  assert.equal(forYouReadyOf({ settings: { enabled: false }, payload: payload({ coldStart: false }) }), false)
  assert.equal(forYouReadyOf({ settings: null, payload: null }), false)
})

test('menuOf: the movie row sits between Not interested and Why this, labelled by the choice', () => {
  const labelsOf = (movieChoice) => menuOf({ item: item({ movieChoice }), nowMs, timeZone }).more.map((a) => a.label)
  assert.deepEqual(labelsOf('not-movie'), ['Not interested in Grand Designs Australia', 'Not a movie', 'Why this?'])
  assert.deepEqual(labelsOf('movie'), ['Not interested in Grand Designs Australia', 'This is a movie', 'Why this?'])
  assert.deepEqual(labelsOf(null), ['Not interested in Grand Designs Australia', 'Why this?'])
  assert.equal(menuOf({ item: item({ movieChoice: 'movie' }), nowMs, timeZone }).more[1].icon, 'tag')
})

test('movieKindToastOf: says whether the show is now listed as a movie', () => {
  assert.equal(movieKindToastOf({ title: 'Heron', kind: 'movie' }), 'Heron is now listed as a movie')
  assert.equal(movieKindToastOf({ title: 'Heron', kind: 'not-movie' }), 'Heron is no longer listed as a movie')
})

test('undoneMovieKindToastOf: says where the show stands after Undo', () => {
  assert.equal(undoneMovieKindToastOf({ title: 'Heron', kind: 'not-movie' }), 'Heron is listed as a movie again')
  assert.equal(undoneMovieKindToastOf({ title: 'Heron', kind: 'movie' }), 'Heron is no longer listed as a movie')
})

test('programOf: carries the movie choice so the programme sheet can offer it', () => {
  assert.equal(programOf({ title: 'King Kong', movieChoice: 'not-movie' }).movieChoice, 'not-movie')
  assert.equal(programOf({ title: 'Heron' }).movieChoice, null)
})
