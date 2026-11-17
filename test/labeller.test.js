import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-labeller-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, setSetting } = await import('../src/db.js')
const { JEV_MODEL, askJev, checkJevKey, jevLabelsOf } = await import('../src/labeller-jev.js')
const { labellerCatalogueOf } = await import('../src/labeller-catalogue.js')
const {
  KEY_REJECTED,
  LABELLER_DAY_SETTING,
  LABELLER_KEY_SETTING,
  LABELLER_KEY_STATUS_SETTING,
  LABELLER_PAUSE_SETTING,
  currentLabellerVersion,
  labellerVersionOf,
  NO_CREDIT,
  createLabeller,
  createPace,
  createSpendGuard,
  labellerInputOf,
  labelsOfStored,
  labellerStatusOf,
  loadLabellerLabels,
  withLabellerLabels,
} = await import('../src/labeller.js')
const { labellerKeyFrom, mountLabellerKey } = await import('../src/labeller-key.js')
const { createCategoryIndex, formatOfTags, mostSpecificCategoryOf, tagTitle } = await import('../src/for-you-categories.js')
const { labellerTitlesOf, genreByteOf } = await import('../src/labeller-titles.js')
const { labellerCheck } = await import('../src/doctor.js')
const { labellerStatusLineOf } = await import('../src/web/labeller-status.js')

const FAKE_KEY = 'ts-test-key-123'
const index = createCategoryIndex({ country: 'au', knownShows: { shows: { 'the-block': { format: 'reality', topics: ['home'] } } } })
const catalogue = labellerCatalogueOf(index)

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const jevAnswers = ({ format = 'reality', formatP = 0.95, topics = { home: 0.9 }, origin = 'au', sport = 'afl' } = {}) => ({
  format: { type: 'choice', choice: format, probabilities: { [format]: formatP } },
  origin: { type: 'choice', choice: origin, probabilities: { [origin]: 0.9 } },
  sport: { type: 'choice', choice: sport, probabilities: { [sport]: 0.8 } },
  ...Object.fromEntries(catalogue.topics.map((item) => [`topic_${item.key}`, { type: 'noul', noul: topics[item.key] ?? 0.05 }])),
})

const response = ({ status = 200, body = {}, headers = {} }) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => JSON.stringify(body),
})

const fakeFetch = (replies) => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    const next = replies.length > 1 ? replies.shift() : replies[0]
    if (next instanceof Error) throw next
    return response(next)
  }
  return { fetchImpl, calls }
}

const input = { title: 'Zog Builds', description: 'Two couples renovate a house.', episodeTitle: null, guideGenres: ['reality'], genreByte: null, channels: ['Nine'], country: 'AU' }

test('askJev sends the pinned model, the key as a bearer token, one Choice per slot and one Noul per topic', async () => {
  const { fetchImpl, calls } = fakeFetch([{ body: { model: JEV_MODEL, answers: jevAnswers(), usage: { input_tokens: 3300, output_tokens: 900 } } }])
  const answer = await askJev({ apiKey: FAKE_KEY, input, catalogue, fetchImpl })
  assert.equal(calls[0].url, 'https://api.typesafe.ai/v1/systemone')
  assert.equal(calls[0].options.headers.authorization, `Bearer ${FAKE_KEY}`)
  const payload = JSON.parse(calls[0].options.body)
  assert.equal(payload.model, 'jev-1.13.0')
  assert.equal(payload.state.title, 'Zog Builds')
  assert.equal(payload.questions.format.type, 'choice')
  assert.deepEqual(Object.keys(payload.questions.format.criteria), catalogue.formats.map((item) => item.key))
  assert.equal(Object.keys(payload.questions).filter((key) => key.startsWith('topic_')).length, catalogue.topics.length)
  assert.deepEqual(answer.labels, { format: 'reality', topics: ['home'], origin: 'au', sport: null, sportP: null })
  assert.equal(answer.raw.format.choice, 'reality')
  assert.equal(answer.raw.topics.home, 0.9)
  assert.equal(answer.inputTokens, 3300)
})

test('jevLabelsOf keeps only answers at or above the threshold, at most two topics, and a sport only with the Sport format', () => {
  const raw = {
    format: { choice: 'sport-format', p: 0.9 },
    origin: { choice: 'other', p: 0.95 },
    sport: { choice: 'cricket', p: 0.4 },
    topics: { history: 0.95, travel: 0.8, nature: 0.75, cooking: 0.6 },
  }
  assert.deepEqual(jevLabelsOf({ raw, threshold: 0.7 }), { format: 'sport-format', topics: ['history', 'travel'], origin: null, sport: 'cricket', sportP: 0.4 })
  assert.deepEqual(jevLabelsOf({ raw: { ...raw, format: { choice: 'drama', p: 0.5 } }, threshold: 0.7 }).format, null)
})

test('askJev retries 5xx and network failures with backoff, then succeeds', async () => {
  const slept = []
  const { fetchImpl, calls } = fakeFetch([{ status: 503 }, new Error('socket hang up'), { body: { answers: jevAnswers() } }])
  const answer = await askJev({ apiKey: FAKE_KEY, input, catalogue, fetchImpl, sleep: async (ms) => slept.push(ms) })
  assert.equal(calls.length, 3)
  assert.equal(slept.length, 2)
  assert.equal(answer.labels.format, 'reality')
})

test('askJev does not retry a rejected key, and hands 429 and 529 back at once with the retry-after delay', async () => {
  const auth = fakeFetch([{ status: 401, body: { detail: 'bad key' } }])
  await assert.rejects(askJev({ apiKey: FAKE_KEY, input, catalogue, fetchImpl: auth.fetchImpl, sleep: async () => {} }), (error) => error.kind === 'auth' && !error.message.includes(FAKE_KEY))
  assert.equal(auth.calls.length, 1)
  const slept = []
  const rate = fakeFetch([{ status: 429, headers: { 'retry-after': '7' } }])
  await assert.rejects(askJev({ apiKey: FAKE_KEY, input, catalogue, fetchImpl: rate.fetchImpl, sleep: async (ms) => slept.push(ms) }), (error) => error.kind === 'rate' && error.retryAfterMs === 7000)
  assert.equal(rate.calls.length, 1)
  const overloaded = fakeFetch([{ status: 529 }])
  await assert.rejects(askJev({ apiKey: FAKE_KEY, input, catalogue, fetchImpl: overloaded.fetchImpl, sleep: async (ms) => slept.push(ms) }), (error) => error.kind === 'rate' && error.retryAfterMs === null)
  assert.deepEqual(slept, [])
})

test('askJev refuses an answer that is missing a question', async () => {
  const { fetchImpl } = fakeFetch([{ body: { answers: { format: jevAnswers().format } } }])
  await assert.rejects(askJev({ apiKey: FAKE_KEY, input, catalogue, fetchImpl }), (error) => error.kind === 'invalid')
})

test('checkJevKey reads the model list: 200 is accepted, 401 is invalid, anything else is unreachable', async () => {
  assert.deepEqual(await checkJevKey({ apiKey: FAKE_KEY, fetchImpl: fakeFetch([{ body: { models: [] } }]).fetchImpl }), { ok: true })
  assert.deepEqual(await checkJevKey({ apiKey: FAKE_KEY, fetchImpl: fakeFetch([{ status: 401 }]).fetchImpl }), { ok: false, reason: 'invalid' })
  assert.deepEqual(await checkJevKey({ apiKey: FAKE_KEY, fetchImpl: fakeFetch([new Error('offline')]).fetchImpl }), { ok: false, reason: 'unreachable' })
})

const factsOf = (overrides = {}) => ({
  key: 'quorrel', title: 'Quorrel', hashes: new Set(), genreTags: new Set(), channelNames: new Set(['Nine']), guideGenres: new Set(),
  genre: null, tvmazeType: null, tvmazeGenres: [], wikidataGenres: [], origin: null, override: null, labeller: null, film: false, kidsSlotsOnly: false,
  ...overrides,
})

test('Jev leads: its labels win over the tagger, origin included', () => {
  const labeller = { format: 'reality', topics: ['home'], origin: 'gb', sport: null }
  const plain = tagTitle({ index, facts: factsOf({ labeller }) })
  assert.equal(mostSpecificCategoryOf(plain), 'home')
  assert.equal(plain.origin, 'gb')
  assert.equal(plain.labelled, true)
  const withEvidence = tagTitle({ index, facts: factsOf({ guideGenres: new Set(['comedy']), labeller: { format: 'news', topics: ['politics'], origin: null, sport: null } }) })
  assert.equal(mostSpecificCategoryOf(withEvidence), 'politics')
  assert.equal(formatOfTags(withEvidence), 'news')
})

test('Jev leads over the known-shows list; owner overrides always win; an empty Jev answer falls back to the list and tagger', () => {
  const labeller = { format: 'drama', topics: ['history'], origin: null, sport: null }
  assert.equal(mostSpecificCategoryOf(tagTitle({ index, facts: factsOf({ key: 'the-block', title: 'The Block', labeller }) })), 'history')
  assert.equal(mostSpecificCategoryOf(tagTitle({ index, facts: factsOf({ override: { format: 'comedy', topics: [] }, labeller }) })), 'comedy')
  const empty = { format: null, topics: [], origin: 'au', sport: null }
  assert.equal(mostSpecificCategoryOf(tagTitle({ index, facts: factsOf({ key: 'the-block', title: 'The Block', labeller: empty }) })), 'home')
  assert.equal(mostSpecificCategoryOf(tagTitle({ index, facts: factsOf({ guideGenres: new Set(['comedy']), labeller: empty }) })), mostSpecificCategoryOf(tagTitle({ index, facts: factsOf({ guideGenres: new Set(['comedy']) }) })))
})

test('a Jev sport answer needs 0.9 for its sport code, else the keyword code or Other sport; fishing stays Fishing', () => {
  const sure = tagTitle({ index, facts: factsOf({ labeller: { format: 'sport-format', topics: [], origin: null, sport: 'cricket', sportP: 0.95 } }) })
  assert.equal(sure.sportCode, 'cricket')
  assert.equal(sure.kind, 'sport')
  const unsure = tagTitle({ index, facts: factsOf({ labeller: { format: 'sport-format', topics: [], origin: null, sport: 'cricket', sportP: 0.5 } }) })
  assert.equal(unsure.sportCode, 'other-sport')
  const keyword = tagTitle({ index, facts: factsOf({ title: 'Big Bash Tonight', labeller: { format: 'sport-format', topics: [], origin: null, sport: 'tennis', sportP: 0.5 } }) })
  assert.equal(keyword.sportCode, 'cricket')
  const fishing = tagTitle({ index, facts: factsOf({ title: 'Fishing Australia', labeller: { format: 'sport-format', topics: [], origin: null, sport: 'other-sport', sportP: 1 } }) })
  assert.equal(mostSpecificCategoryOf(fishing), 'fishing')
  const fishingTopic = tagTitle({ index, facts: factsOf({ title: 'Hook Line', labeller: { format: 'sport-format', topics: ['fishing'], origin: null, sport: 'other-sport', sportP: 1 } }) })
  assert.equal(mostSpecificCategoryOf(fishingTopic), 'fishing')
})

test('labellerTitlesOf asks about every guide show except films and owner-overridden titles, without viewer data', () => {
  const programmes = [
    { title: 'Quorrel', channel_id: '1', start: 1, end: 2, synopsis: 'Two couples renovate a house.', episode_title: 'Week 2', genre: null },
    { title: 'The Block', channel_id: '1', start: 3, end: 4, synopsis: 'Renovation.', genre: null },
    { title: 'Chosen Show', channel_id: '1', start: 5, end: 6, synopsis: 'Something.', genre: null },
    { title: 'Some Film', channel_id: '1', start: 7, end: 8, synopsis: 'A film.', genre: null },
  ]
  const titles = labellerTitlesOf({
    programmes,
    channels: [{ id: 1, name: 'Nine' }],
    records: new Map([['chosen-show', { genreTags: [], genres: [], source: null, categoryOverride: { format: 'comedy', topics: [] } }]]),
    index,
    kindOf: (programme) => (programme.title === 'Some Film' ? 'movie' : 'series'),
  })
  assert.deepEqual(titles.map((title) => title.key), ['quorrel', 'the-block'])
  assert.deepEqual(titles[0].input, { title: 'Quorrel', description: 'Two couples renovate a house.', episodeTitle: 'Week 2', guideGenres: [], genreByte: null, channels: ['Nine'], country: 'AU' })
  assert.equal(genreByteOf({ genre: 0x14, country: 'au' }), '0x14 Comedy')
})

test('stored raw probabilities are read back through the current thresholds', () => {
  const raw = { format: { choice: 'reality', p: 0.75 }, origin: { choice: 'au', p: 0.9 }, sport: { choice: 'other-sport', p: 1 }, topics: { home: 0.72, travel: 0.4 } }
  assert.deepEqual(labelsOfStored({ format: 'reality', topics: [], raw }), { format: 'reality', topics: ['home'], origin: 'au', sport: null, sportP: null })
  assert.deepEqual(labelsOfStored({ format: 'news', topics: [] }), { format: 'news', topics: [] })
})

test('labellerInputOf trims long descriptions and caps channels', () => {
  const programmes = Array.from({ length: 6 }, (_, i) => ({ channel_id: String(i), synopsis: 'x'.repeat(500) }))
  const built = labellerInputOf({ title: 'Zog', programmes, channelNames: new Map(programmes.map((programme, i) => [String(i), `Ch ${i}`])), guideGenres: [], genreByte: null, country: 'nz' })
  assert.equal(built.description.length, 300)
  assert.equal(built.channels.length, 4)
  assert.equal(built.country, 'NZ')
})

const memoryStore = () => {
  const rows = new Map()
  const pruned = []
  return {
    rows,
    pruned,
    settledKeys: async ({ version, nowMs }) => new Set([...rows.values()].filter((row) => row.version === version && (row.status === 'ok' || row.retryAfter > nowMs)).map((row) => row.key)),
    write: async (row) => { rows.set(row.key, row) },
    prune: async ({ keep }) => {
      pruned.push(keep)
      for (const [key, row] of rows) if (row.version !== keep) rows.delete(key)
    },
  }
}

const memorySettings = (initial = {}) => {
  const values = new Map(Object.entries(initial))
  return { values, get: async (key) => values.get(key) ?? null, set: async (key, value) => { values.set(key, value) } }
}

const titlesOf = (...keys) => keys.map((key) => ({ key, input: { ...input, title: key } }))

test('createLabeller asks nothing without a key', async () => {
  let asked = 0
  const labeller = createLabeller({ readKey: async () => null, ask: async () => { asked += 1 }, store: memoryStore(), settings: memorySettings() })
  assert.deepEqual(await labeller.run({ titles: titlesOf('a'), catalogue }), { skipped: 'no-key' })
  assert.equal(asked, 0)
})

test('createLabeller asks each title once per labeller version, and caches empty answers too', async () => {
  const store = memoryStore()
  const asked = []
  const ask = async ({ input: { title } }) => {
    asked.push(title)
    return { labels: title === 'b' ? { format: null, topics: [], origin: null, sport: null } : { format: 'reality', topics: [], origin: null, sport: null }, confidence: 0.9 }
  }
  const labeller = createLabeller({ readKey: async () => FAKE_KEY, ask, store, settings: memorySettings() })
  const first = await labeller.run({ titles: titlesOf('a', 'b', 'a'), catalogue })
  assert.equal(first.asked, 2)
  assert.equal(first.labelled, 1)
  assert.equal(store.rows.get('b').status, 'none')
  assert.equal(store.rows.get('a').version, labellerVersionOf('au'))
  await labeller.run({ titles: titlesOf('a', 'b'), catalogue })
  assert.deepEqual(asked.sort(), ['a', 'b'])
})

test('createLabeller keeps a failed title out until its retry time, and stops after three failures in a row', async () => {
  let clock = 1000
  const store = memoryStore()
  let asked = 0
  const ask = async () => {
    asked += 1
    throw Object.assign(new Error('Jev server'), { kind: 'server' })
  }
  const labeller = createLabeller({ readKey: async () => FAKE_KEY, ask, store, settings: memorySettings(), now: () => clock, concurrency: 1, failureBackoffMs: 500 })
  const outcome = await labeller.run({ titles: titlesOf('a', 'b', 'c', 'd'), catalogue })
  assert.equal(outcome.stopped, 'failing')
  assert.equal(asked, 3)
  assert.equal(store.rows.get('a').retryAfter, 1500)
  await labeller.run({ titles: titlesOf('a'), catalogue })
  assert.equal(asked, 3)
  clock = 2000
  await labeller.run({ titles: titlesOf('a'), catalogue })
  assert.equal(asked, 4)
})

test('createLabeller marks the key rejected on 401 or 403 and asks nothing more until the key changes', async () => {
  const settings = memorySettings()
  let asked = 0
  const ask = async () => {
    asked += 1
    throw Object.assign(new Error('Jev auth'), { kind: 'auth', status: 401 })
  }
  const labeller = createLabeller({ readKey: async () => FAKE_KEY, ask, store: memoryStore(), settings, concurrency: 1 })
  const outcome = await labeller.run({ titles: titlesOf('a', 'b'), catalogue })
  assert.equal(outcome.stopped, 'auth')
  assert.equal(asked, 1)
  assert.equal(settings.values.get(LABELLER_KEY_STATUS_SETTING), KEY_REJECTED)
  assert.deepEqual(await labeller.run({ titles: titlesOf('c'), catalogue }), { skipped: 'key-rejected' })
  assert.equal(asked, 1)
})

const fakeClock = () => {
  let at = 0
  return { now: () => at, sleep: async (ms) => { at += ms } }
}

test('createPace halves concurrency on a 429, backs off from 2 s, honours retry-after, and creeps back after a quiet minute', () => {
  const clock = fakeClock()
  const pace = createPace({ now: clock.now, max: 8 })
  assert.equal(pace.waitMs(0), 0)
  assert.equal(pace.noteRate(null), 'slow')
  assert.equal(pace.limit(), 4)
  assert.equal(pace.waitMs(0), 2000)
  pace.noteRate(null)
  assert.equal(pace.limit(), 2)
  assert.equal(pace.waitMs(0), 4000)
  pace.noteRate(90_000)
  assert.equal(pace.waitMs(0), 60_000)
  clock.sleep(30_000)
  assert.equal(pace.waitMs(0), 30_000)
  clock.sleep(30_000)
  assert.equal(pace.waitMs(1), 0)
  assert.equal(pace.limit(), 2)
  assert.equal(pace.waitMs(2), 50)
  clock.sleep(60_000)
  pace.waitMs(0)
  assert.equal(pace.limit(), 3)
})

test('createLabeller asks a rate-limited title again after the back-off, without a pause', async () => {
  const clock = fakeClock()
  const settings = memorySettings()
  let calls = 0
  const labeller = createLabeller({
    readKey: async () => FAKE_KEY,
    ask: async () => {
      calls += 1
      if (calls === 1) throw Object.assign(new Error('Jev rate'), { kind: 'rate', retryAfterMs: null })
      return { labels: { format: 'news', topics: [], origin: null, sport: null }, confidence: 1, inputTokens: 3000 }
    },
    store: memoryStore(),
    settings,
    ...clock,
  })
  const outcome = await labeller.run({ titles: titlesOf('a', 'b'), catalogue })
  assert.equal(outcome.labelled, 2)
  assert.equal(outcome.rateLimited, 1)
  assert.equal(outcome.stopped, null)
  assert.equal(settings.values.get(LABELLER_PAUSE_SETTING), undefined)
})

test('createLabeller pauses for an hour only after repeated 429s in a short window', async () => {
  const clock = fakeClock()
  const settings = memorySettings()
  const labeller = createLabeller({
    readKey: async () => FAKE_KEY,
    ask: async () => { throw Object.assign(new Error('Jev rate'), { kind: 'rate', retryAfterMs: 1000 }) },
    store: memoryStore(),
    settings,
    ...clock,
  })
  const outcome = await labeller.run({ titles: titlesOf('a'), catalogue })
  assert.equal(outcome.stopped, 'rate')
  assert.equal(outcome.rateLimited, 8)
  assert.ok(Number(settings.values.get(LABELLER_PAUSE_SETTING)) >= clock.now() + 60 * 60 * 1000)
  assert.deepEqual(await labeller.run({ titles: titlesOf('b'), catalogue }), { skipped: 'paused' })
})

test('createLabeller stops at the daily spend ceiling from real token counts, and starts again the next day', async () => {
  let at = Date.UTC(2026, 10, 18, 10)
  const settings = memorySettings()
  let asked = 0
  const labeller = createLabeller({
    readKey: async () => FAKE_KEY,
    ask: async () => { asked += 1; return { labels: { format: 'news', topics: [], origin: null, sport: null }, confidence: 1, inputTokens: 1_000_000 } },
    store: memoryStore(),
    settings,
    now: () => at,
    concurrency: 1,
    dailySpendUsd: 0.1,
  })
  const outcome = await labeller.run({ titles: titlesOf('a', 'b', 'c', 'd'), catalogue })
  assert.equal(asked, 2)
  assert.equal(outcome.stopped, 'budget')
  assert.equal(Math.round(outcome.spentUsd * 1000), 84)
  assert.equal((await labeller.run({ titles: titlesOf('c'), catalogue })).stopped, 'budget')
  at += 24 * 60 * 60 * 1000
  await labeller.run({ titles: titlesOf('c'), catalogue })
  assert.equal(asked, 3)
})

test('createSpendGuard counts a missing token count at the estimate, and keeps the runaway request ceiling', () => {
  const guard = createSpendGuard({ stored: null, day: '2026-11-18', dailySpendUsd: 100, maxRequestsPerDay: 2 })
  assert.equal(guard.add(undefined), (4000 * 0.042) / 1e6)
  assert.equal(guard.allows(0), true)
  guard.add(10)
  assert.equal(guard.allows(0), false)
  assert.deepEqual(createSpendGuard({ stored: JSON.stringify({ day: '2026-11-17', usd: 9, requests: 9 }), day: '2026-11-18', dailySpendUsd: 1, maxRequestsPerDay: 5 }).state(), { day: '2026-11-18', usd: 0, requests: 0, tokens: 0, answers: 0 })
})

test('withLabellerLabels adds labels to existing and new records without dropping other fields', () => {
  const merged = withLabellerLabels({ records: new Map([['a', { genreTags: ['drama'], genres: ['x'], source: 'tvmaze:1' }]]), labels: new Map([['a', { format: 'drama' }], ['b', { format: 'news' }]]) })
  assert.deepEqual(merged.get('a'), { genreTags: ['drama'], genres: ['x'], source: 'tvmaze:1', labellerLabels: { format: 'drama' } })
  assert.deepEqual(merged.get('b'), { genreTags: [], genres: [], source: null, labellerLabels: { format: 'news' } })
})

test('migration 0054 adds title_labels; stored labels count only while a key is saved', async () => {
  await db.migrate.latest()
  assert.equal(await db.schema.hasTable('title_labels'), true)
  await db('title_labels').insert([
    { show_key: 'zog', labeller_version: currentLabellerVersion(), status: 'ok', labels_json: JSON.stringify({ format: 'reality', topics: [] }), confidence: 0.9, fetched_at: 1 },
    { show_key: 'old', labeller_version: 'jev-0/catalogue-1/prompt-0', status: 'ok', labels_json: JSON.stringify({ format: 'news', topics: [] }), confidence: 0.9, fetched_at: 1 },
    { show_key: 'blank', labeller_version: currentLabellerVersion(), status: 'none', labels_json: '{}', confidence: 0.2, fetched_at: 1 },
  ])
  assert.deepEqual([...(await loadLabellerLabels()).keys()], [])
  await setSetting(LABELLER_KEY_SETTING, FAKE_KEY)
  assert.deepEqual([...(await loadLabellerLabels()).keys()], ['zog'])
  assert.equal((await labellerStatusOf()).labelled, 1)
  await setSetting(LABELLER_KEY_SETTING, '')
  await db.migrate.down()
  assert.equal(await db.schema.hasTable('title_labels'), false)
  await db.migrate.latest()
})

test('labeller key routes never return the key, validate before saving, and reset a rejected key on save', async () => {
  const handlers = {}
  const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map((method) => [method, (route, ...stack) => { handlers[`${method} ${route}`] = stack.at(-1) }]))
  const saved = []
  let resets = 0
  mountLabellerKey({
    app,
    csrf: () => {},
    limiter: () => {},
    validate: async ({ apiKey }) => (apiKey === FAKE_KEY ? { ok: true } : { ok: false, reason: 'invalid' }),
    status: async () => ({ keySet: true, keyRejected: false, labelled: 4, lastRun: { at: 5, failed: 1, error: 'Freetvarr could not reach TypeSafe.' } }),
    save: async (key, value) => { saved.push([key, value]) },
    reset: async () => { resets += 1 },
    readKey: async () => FAKE_KEY,
  })
  const call = async (name, body = {}) => {
    const res = { code: 200, body: null, status(code) { this.code = code; return this }, json(value) { this.body = value; return this } }
    await handlers[name]({ body }, res)
    return res
  }
  const state = await call('get /api/labeller')
  assert.deepEqual(state.body, { key_set: true, key_rejected: false, key_no_credit: false, labelled: 4, last_run_at: 5, last_error: 'Freetvarr could not reach TypeSafe.' })
  assert.ok(!JSON.stringify(state.body).includes(FAKE_KEY))
  assert.equal((await call('put /api/labeller', { key: 'wrong-key' })).code, 400)
  assert.deepEqual(saved, [])
  const put = await call('put /api/labeller', { key: ` ${FAKE_KEY} ` })
  assert.deepEqual(put.body, { ok: true, key_set: true, checked: true })
  assert.deepEqual(saved, [[LABELLER_KEY_SETTING, FAKE_KEY]])
  assert.equal(resets, 1)
  assert.equal((await call('put /api/labeller', { key: 'has space' })).code, 400)
  assert.deepEqual((await call('delete /api/labeller')).body, { ok: true, key_set: false })
  assert.deepEqual(saved.at(-1), [LABELLER_KEY_SETTING, ''])
  assert.equal(labellerKeyFrom('x'.repeat(2000)), null)
})

test('labellerCheck: hidden with no key, fails on a rejected key, warns when the last run stopped early', () => {
  assert.equal(labellerCheck({ keySet: false }).status, 'hidden')
  assert.equal(labellerCheck({ keySet: true, keyRejected: true }).status, 'fail')
  assert.equal(labellerCheck({ keySet: true, labelled: 3, lastRun: { stopped: 'rate', error: 'TypeSafe asked Freetvarr to slow down.' } }).status, 'warn')
  assert.deepEqual(labellerCheck({ keySet: true, labelled: 1, lastRun: { at: 1 } }), { status: 'pass', detail: 'Jev labelled 1 guide title.' })
})

test('labellerStatusLineOf describes the saved state for Settings', () => {
  assert.deepEqual(labellerStatusLineOf({ key_set: false }), { text: '', kind: 'info' })
  assert.equal(labellerStatusLineOf({ key_set: true, key_rejected: true }).kind, 'err')
  assert.equal(labellerStatusLineOf({ key_set: true, labelled: 12 }).text, 'Jev has labelled 12 guide titles.')
  assert.match(labellerStatusLineOf({ key_set: true, labelled: 1, last_error: 'Freetvarr could not reach TypeSafe.' }).text, /^Jev has labelled 1 guide title\. Last run: /)
})

test('askJev reports an empty TypeSafe balance as out of credit: 402, or a 400 whose body says so', async () => {
  const payment = fakeFetch([{ status: 402, body: { detail: 'Payment required' } }])
  await assert.rejects(askJev({ apiKey: FAKE_KEY, input, catalogue, fetchImpl: payment.fetchImpl, sleep: async () => {} }), (error) => error.kind === 'credit')
  assert.equal(payment.calls.length, 1)
  const billing = fakeFetch([{ status: 400, body: { detail: 'Insufficient credit balance. Add credits in Billing.' } }])
  await assert.rejects(askJev({ apiKey: FAKE_KEY, input, catalogue, fetchImpl: billing.fetchImpl, sleep: async () => {} }), (error) => error.kind === 'credit')
  const plain403 = fakeFetch([{ status: 403, body: { detail: 'Forbidden' } }])
  await assert.rejects(askJev({ apiKey: FAKE_KEY, input, catalogue, fetchImpl: plain403.fetchImpl, sleep: async () => {} }), (error) => error.kind === 'auth')
})

test('createLabeller stops on an empty balance, probes with one request a day, and carries on when credit is back', async () => {
  const clock = fakeClock()
  const settings = memorySettings()
  const store = memoryStore()
  let credit = false
  let calls = 0
  const labeller = createLabeller({
    readKey: async () => FAKE_KEY,
    ask: async () => {
      calls += 1
      if (!credit) throw Object.assign(new Error('Jev credit'), { kind: 'credit', status: 402 })
      return { labels: { format: 'news', topics: [], origin: null, sport: null }, confidence: 1, inputTokens: 3000 }
    },
    store,
    settings,
    ...clock,
  })
  const first = await labeller.run({ titles: titlesOf('a', 'b', 'c'), catalogue })
  assert.equal(first.stopped, 'credit')
  assert.equal(settings.values.get(LABELLER_KEY_STATUS_SETTING), NO_CREDIT)
  assert.equal(store.rows.size, 0)
  const callsAfterFirst = calls
  assert.deepEqual(await labeller.run({ titles: titlesOf('a'), catalogue }), { skipped: 'no-credit' })
  await clock.sleep(24 * 60 * 60 * 1000)
  const probe = await labeller.run({ titles: titlesOf('a', 'b', 'c'), catalogue })
  assert.equal(calls, callsAfterFirst + 1)
  assert.equal(probe.stopped, 'credit')
  credit = true
  await clock.sleep(24 * 60 * 60 * 1000)
  const back = await labeller.run({ titles: titlesOf('a', 'b', 'c'), catalogue })
  assert.equal(back.labelled, 3)
  assert.equal(settings.values.get(LABELLER_KEY_STATUS_SETTING), '')
})

test('out of credit: Settings names the console address, and Health warns while categories carry on', () => {
  const line = labellerStatusLineOf({ key_set: true, key_no_credit: true, labelled: 5 })
  assert.equal(line.kind, 'err')
  assert.match(line.text, /^Your TypeSafe account is out of credit, so Freetvarr stopped asking Jev\./)
  assert.equal(line.address, 'console.typesafe.ai')
  assert.equal(line.after, '; Freetvarr tries again once a day.')
  const check = labellerCheck({ keySet: true, noCredit: true, labelled: 5 })
  assert.equal(check.status, 'warn')
  assert.match(check.detail, /Categories carry on from the other sources/)
})

test('ready() is false without a key, with a rejected key, and while paused, and reads nothing else', async () => {
  let reads = 0
  const store = { settledKeys: async () => { reads += 1; return new Set() } }
  const noKey = createLabeller({ readKey: async () => null, store, settings: memorySettings() })
  assert.equal(await noKey.ready(), false)
  assert.equal(await createLabeller({ readKey: async () => FAKE_KEY, store, settings: memorySettings({ [LABELLER_KEY_STATUS_SETTING]: KEY_REJECTED }) }).ready(), false)
  assert.equal(await createLabeller({ readKey: async () => FAKE_KEY, store, settings: memorySettings({ [LABELLER_PAUSE_SETTING]: String(Date.now() + 60_000) }) }).ready(), false)
  assert.equal(await createLabeller({ readKey: async () => FAKE_KEY, store, settings: memorySettings() }).ready(), true)
  assert.equal(reads, 0)
})

test('out of credit is only a 402, or a 400 or 422 that names billing; a 429 or 403 with billing words is not', async () => {
  const kindFor = async (reply) => askJev({ apiKey: FAKE_KEY, input, catalogue, fetchImpl: fakeFetch([reply]).fetchImpl, sleep: async () => {} }).catch((error) => error.kind)
  assert.equal(await kindFor({ status: 400, body: { detail: 'insufficient credit balance' } }), 'credit')
  assert.equal(await kindFor({ status: 422, body: { detail: 'billing: payment required' } }), 'credit')
  assert.equal(await kindFor({ status: 429, body: { detail: 'Upgrade your billing plan for higher limits' } }), 'rate')
  assert.equal(await kindFor({ status: 529, body: { detail: 'billing system busy' } }), 'rate')
  assert.equal(await kindFor({ status: 403, body: { detail: 'Billing account suspended' } }), 'auth')
  assert.equal(await kindFor({ status: 400, body: { detail: 'state too large' } }), 'invalid')
})

test('createLabeller saves the day spend after each answer, so a restart mid-run keeps it', async () => {
  const settings = memorySettings()
  const seen = []
  const labeller = createLabeller({
    readKey: async () => FAKE_KEY,
    ask: async () => {
      seen.push(JSON.parse(settings.values.get(LABELLER_DAY_SETTING) ?? '{"requests":0}').requests)
      return { labels: { format: 'news', topics: [], origin: null, sport: null }, confidence: 1, inputTokens: 3000 }
    },
    store: memoryStore(),
    settings,
    concurrency: 1,
  })
  await labeller.run({ titles: titlesOf('a', 'b', 'c'), catalogue })
  assert.deepEqual(seen, [0, 1, 2])
})

test('a failed credit probe keeps the pause and stops the run', async () => {
  const at = 10_000
  const settings = memorySettings({ [LABELLER_KEY_STATUS_SETTING]: NO_CREDIT, [LABELLER_PAUSE_SETTING]: String(at - 1) })
  let calls = 0
  const labeller = createLabeller({
    readKey: async () => FAKE_KEY,
    ask: async () => { calls += 1; throw Object.assign(new Error('Jev network'), { kind: 'network' }) },
    store: memoryStore(),
    settings,
    now: () => at,
  })
  const outcome = await labeller.run({ titles: titlesOf('a', 'b', 'c'), catalogue })
  assert.equal(calls, 1)
  assert.equal(outcome.stopped, 'credit')
  assert.equal(settings.values.get(LABELLER_KEY_STATUS_SETTING), NO_CREDIT)
  assert.equal(settings.values.get(LABELLER_PAUSE_SETTING), String(at + 24 * 60 * 60 * 1000))
})

test('the daily spend resets at midnight in the server time zone', async () => {
  const settings = memorySettings()
  const labeller = createLabeller({
    readKey: async () => FAKE_KEY,
    ask: async () => ({ labels: { format: 'news', topics: [], origin: null, sport: null }, confidence: 1, inputTokens: 3000 }),
    store: memoryStore(),
    settings,
    now: () => Date.UTC(2026, 10, 18, 14, 0),
    timeZone: () => 'Australia/Sydney',
  })
  await labeller.run({ titles: titlesOf('a'), catalogue })
  assert.equal(JSON.parse(settings.values.get(LABELLER_DAY_SETTING)).day, '2026-11-19')
})

test('the labeller version names the country, so a new country asks again once and prunes the old answers', async () => {
  assert.notEqual(labellerVersionOf('au'), labellerVersionOf('nz'))
  const store = memoryStore()
  const ask = async () => ({ labels: { format: 'news', topics: [], origin: null, sport: null }, confidence: 1, inputTokens: 3000 })
  const labeller = createLabeller({ readKey: async () => FAKE_KEY, ask, store, settings: memorySettings() })
  await labeller.run({ titles: titlesOf('a'), catalogue })
  const nz = labellerCatalogueOf(createCategoryIndex({ country: 'nz' }))
  const again = await labeller.run({ titles: titlesOf('a'), catalogue: nz })
  assert.equal(again.asked, 1)
  assert.equal(store.rows.get('a').version, labellerVersionOf('nz'))
  assert.deepEqual(store.pruned.at(-1), labellerVersionOf('nz'))
})

test('an empty Jev answer is asked again after 30 days, not before', async () => {
  let at = 1_000
  let asked = 0
  const labeller = createLabeller({
    readKey: async () => FAKE_KEY,
    ask: async () => { asked += 1; return { labels: { format: null, topics: [], origin: null, sport: null }, confidence: 0.3, inputTokens: 3000 } },
    store: memoryStore(),
    settings: memorySettings(),
    now: () => at,
  })
  await labeller.run({ titles: titlesOf('a'), catalogue })
  at += 29 * 24 * 60 * 60 * 1000
  await labeller.run({ titles: titlesOf('a'), catalogue })
  assert.equal(asked, 1)
  at += 2 * 24 * 60 * 60 * 1000
  await labeller.run({ titles: titlesOf('a'), catalogue })
  assert.equal(asked, 2)
})
