import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'

import {
  EPISODE_CHAIN,
  FREEVIEW_FIRST_GUIDE_CHAIN,
  GUIDE_ONLY_CHAIN,
  TITLE_CHAINS,
  canonicalKindOf,
  chainOf,
  episodePictureOrderFrom,
  stillsAllowed,
  isGuessedFilmKind,
  onlineArtworkOf,
  createArtResolver,
  guideKindsOf,
  freeviewAiringOriginsOf,
  guideSourcesOf,
  pictureChangeOf,
  programmeWarmOriginsOf,
  recordingPictureOrderOf,
  pictureStampOf,
} from '../src/art-resolver.js'
import { imageRouteOf, serveImageRoute } from '../src/image-routes.js'
import { portraitPadOf } from '../src/show-poster.js'
import { artKindHintOf, showImageUrlOf } from '../src/web/artwork-stamps.js'
import { artProbeStateOf } from '../src/web/art-fallback.js'

const HOUR = 60 * 60 * 1000
const POSTER = { width: 680, height: 1000 }
const WIDE = { width: 1280, height: 720 }
const SMALL_POSTER = { width: 200, height: 300 }
const OBSESSION_THUMB = { width: 720, height: 405 }

const memoryStore = () => {
  const rows = new Map()
  return {
    rows,
    read: async (key) => rows.get(key) ?? null,
    write: async (row) => { rows.set(row.resolution_key, row) },
    remove: async (key) => { rows.delete(key) },
    removeTitle: async (titleKey) => { for (const [key, row] of rows) if (row.title_key === titleKey) rows.delete(key) },
    stamped: async () => [...rows.values()].filter((row) => row.stamp),
  }
}

const resolverWith = ({ stages = {}, sizes = {}, libraryKinds = [], guideKind = null, override = null, clock = { ms: 1_000 }, store = memoryStore(), ...rest } = {}) => {
  const calls = []
  const counted = Object.fromEntries(Object.entries(stages).map(([name, step]) => [name, async (ctx) => {
    calls.push(name)
    return step(ctx)
  }]))
  const resolver = createArtResolver({
    stages: counted,
    kindOf: async ({ hint }) => canonicalKindOf({ libraryKinds, override, guideKind, hint }),
    loadImage: async (origin) => (sizes[origin] ? { body: Buffer.from(origin) } : null),
    sizeOf: async (image) => sizes[image.body.toString()],
    store,
    now: () => clock.ms,
    followUpDelaysMs: [],
    ...rest,
  })
  return { resolver, calls, store, clock }
}

const throwingClient = () => {
  const client = { calls: 0 }
  client.step = async () => {
    client.calls += 1
    throw new Error('the web is down')
  }
  return client
}

test('chainOf: each kind runs its own chain, from the owner choice to no picture', () => {
  const table = [
    [{ kind: 'movie' }, ['choice', 'plex', 'recording', 'guide', 'online', 'derived', 'frame', 'derived', 'none']],
    [{ kind: 'series' }, ['choice', 'plex', 'recording', 'guide', 'online', 'derived', 'frame', 'derived', 'none']],
    [{ kind: 'one-off' }, ['choice', 'plex', 'recording', 'guide', 'frame', 'online', 'derived', 'none']],
    [{ kind: 'series', recordingId: 'r1' }, ['episode', 'title', 'frame', 'none']],
    [{ kind: 'series', recordingId: 'r1', episodeOrder: 'series' }, ['episode', 'title', 'frame', 'none']],
    [{ kind: 'series', recordingId: 'r1', episodeOrder: 'frame' }, ['episode', 'frame', 'title', 'none']],
    [{ kind: 'movie', eventId: 'e1' }, ['own', 'saved', 'same-title', 'freeview', 'title', 'none']],
    [{ kind: 'movie', eventId: 'e1', freeviewFirst: false }, ['own', 'saved', 'same-title', 'freeview', 'title', 'none']],
    [{ kind: 'movie', eventId: 'e1', freeviewFirst: true }, ['freeview', 'freeview-title', 'own', 'saved', 'same-title', 'title', 'none']],
    [{ kind: 'series', freeviewFirst: true }, TITLE_CHAINS.series],
    [{ kind: 'unknown' }, TITLE_CHAINS.series],
  ]
  for (const [request, chain] of table) assert.deepEqual(chainOf(request), chain, JSON.stringify(request))
  assert.equal(chainOf({ kind: 'series', recordingId: 'r1' }), EPISODE_CHAIN)
  assert.equal(chainOf({ kind: 'series', eventId: 'e1' }), GUIDE_ONLY_CHAIN)
  assert.equal(chainOf({ kind: 'series', eventId: 'e1', freeviewFirst: true }), FREEVIEW_FIRST_GUIDE_CHAIN)
})

test('canonicalKindOf: library kind, then programme-kind override, then guide kind; the URL kind is only a hint', () => {
  const table = [
    [{ libraryKinds: ['movie'] }, 'movie'],
    [{ libraryKinds: ['movie'], guideKind: 'series' }, 'movie'],
    [{ libraryKinds: ['movie', 'series'], hint: 'movie' }, 'movie'],
    [{ libraryKinds: ['movie', 'series'], hint: 'series' }, 'series'],
    [{ libraryKinds: ['movie', 'series'] }, 'series'],
    [{ libraryKinds: ['series'], hint: 'movie' }, 'movie'],
    [{ override: 'movie', guideKind: 'series' }, 'movie'],
    [{ override: 'show', guideKind: 'movie' }, 'series'],
    [{ override: 'one-off', hint: 'movie' }, 'one-off'],
    [{ override: 'not-movie', guideKind: 'movie', hint: 'movie' }, 'series'],
    [{ guideKind: 'one-off', hint: 'movie' }, 'one-off'],
    [{ hint: 'movie' }, 'movie'],
    [{ hint: 'bogus' }, 'series'],
    [{}, 'series'],
  ]
  for (const [input, kind] of table) assert.equal(canonicalKindOf(input), kind, JSON.stringify(input))
})

test('guideKindsOf: a title is a film only when every airing is a film, else the commoner of series and one-off', () => {
  const kinds = guideKindsOf([
    { title: 'Heat', kind: 'movie' },
    { title: 'Heat', kind: 'movie' },
    { title: 'Fargo', kind: 'movie' },
    { title: 'Fargo', kind: 'series' },
    { title: 'The Cup Final', kind: 'one-off' },
  ])
  assert.deepEqual(Object.fromEntries(kinds), { heat: 'movie', fargo: 'series', 'cup final': 'one-off' })
})

test('a client that throws is never called when Plex or the recording has art', async () => {
  for (const local of ['plex', 'recording']) {
    const client = throwingClient()
    const { resolver } = resolverWith({
      stages: { [local]: async () => ({ sources: [`${local}:art`] }), online: client.step },
      sizes: { [`${local}:art`]: WIDE },
    })
    const found = await resolver.resolve({ title: 'Garden Rescue' })
    assert.deepEqual([found.stage, found.origin], [local, `${local}:art`])
    assert.equal(client.calls, 0, local)
  }
})

test('a film with kind=movie gets its Plex poster', async () => {
  const kinds = []
  const { resolver } = resolverWith({
    libraryKinds: ['movie'],
    stages: {
      plex: async ({ kind, shape }) => {
        kinds.push(kind)
        return { sources: shape === 'poster' ? ['plex:/thumb', 'plex:/art'] : ['plex:/art', 'plex:/thumb'] }
      },
      online: throwingClient().step,
    },
    sizes: { 'plex:/thumb': POSTER, 'plex:/art': WIDE },
  })
  const found = await resolver.resolve({ title: 'Dune', kind: 'movie', shape: 'poster' })
  assert.deepEqual(found, { stage: 'plex', origin: 'plex:/thumb', transform: 'none', pending: false, kind: 'movie' })
  assert.deepEqual(kinds, ['movie'])
})

test('list and detail get the same origin', async () => {
  const { resolver, calls, store } = resolverWith({
    libraryKinds: ['movie'],
    stages: { plex: async () => ({ sources: ['plex:/art'] }), guide: async () => ({ sources: ['guide:still'] }) },
    sizes: { 'plex:/art': WIDE, 'guide:still': WIDE },
  })
  const list = await resolver.resolve({ title: 'Heat' })
  const detail = await resolver.resolve({ title: 'Heat', kind: 'movie' })
  assert.deepEqual([list.origin, list.kind], [detail.origin, detail.kind])
  assert.deepEqual([...store.rows.keys()], ['movie|landscape|heat'])
  assert.equal(calls.filter((name) => name === 'plex').length, 2)
})

test('a film and a series with the same title resolve to their own pictures and rows', async () => {
  const { resolver, store } = resolverWith({
    libraryKinds: ['movie', 'series'],
    stages: { plex: async ({ kind }) => ({ sources: [`plex:/${kind}`] }) },
    sizes: { 'plex:/movie': WIDE, 'plex:/series': WIDE },
  })
  assert.equal((await resolver.resolve({ title: 'Fargo', kind: 'movie' })).origin, 'plex:/movie')
  assert.equal((await resolver.resolve({ title: 'Fargo', kind: 'series' })).origin, 'plex:/series')
  assert.deepEqual([...store.rows.keys()].sort(), ['movie|landscape|fargo', 'series|landscape|fargo'])
})

test('derived portrait: a landscape-only Plex picture becomes a padded poster when nothing online fits', async () => {
  const { resolver } = resolverWith({
    libraryKinds: ['movie'],
    stages: { plex: async () => ({ sources: ['plex:/thumb'] }), online: async () => ({ sources: [] }) },
    sizes: { 'plex:/thumb': OBSESSION_THUMB },
  })
  const found = await resolver.resolve({ title: 'Obsession', shape: 'poster' })
  assert.deepEqual([found.stage, found.origin, found.transform], ['derived', 'plex:/thumb', 'pad'])
})

test('an online picture of the right shape beats a Plex picture of the wrong shape or under 300 px', async () => {
  for (const plexSize of [OBSESSION_THUMB, SMALL_POSTER]) {
    const { resolver } = resolverWith({
      stages: { plex: async () => ({ sources: ['plex:/thumb'] }), online: async () => ({ sources: ['https://tmdb.test/poster.jpg'] }) },
      sizes: { 'plex:/thumb': plexSize, 'https://tmdb.test/poster.jpg': POSTER },
    })
    const found = await resolver.resolve({ title: 'Obsession', kind: 'movie', shape: 'poster' })
    assert.deepEqual([found.stage, found.origin], ['online', 'https://tmdb.test/poster.jpg'])
  }
})

test('a small Plex poster of the right shape is kept as it is when nothing online fits', async () => {
  const { resolver } = resolverWith({
    stages: { plex: async () => ({ sources: ['plex:/thumb'] }) },
    sizes: { 'plex:/thumb': SMALL_POSTER },
  })
  const found = await resolver.resolve({ title: 'Obsession', shape: 'poster' })
  assert.deepEqual([found.stage, found.transform], ['derived', 'none'])
})

test('a pending online lookup is reported and not saved, so the next request asks again', async () => {
  const { resolver, store } = resolverWith({
    stages: { plex: async () => ({ sources: ['plex:/thumb'] }), online: async () => ({ sources: [], pending: true }) },
    sizes: { 'plex:/thumb': OBSESSION_THUMB },
  })
  assert.equal((await resolver.resolve({ title: 'Obsession', shape: 'poster' })).pending, true)
  assert.equal(store.rows.size, 0)
})

test('no picture is the last step; the miss is saved with a 6 h to 7 d retry ladder, and new evidence retries at once', async () => {
  let guide = []
  const { resolver, store, clock, calls } = resolverWith({
    stages: { guide: async () => ({ sources: guide }), online: async () => ({ sources: [] }) },
    sizes: { 'guide:new': WIDE },
  })
  const waits = []
  for (let round = 0; round < 5; round += 1) {
    const found = await resolver.resolve({ title: 'Nowhere Show' })
    assert.equal(found.stage, 'none')
    const row = store.rows.get('series|landscape|nowhere show')
    waits.push((row.next_check_at - clock.ms) / HOUR)
    if (round < 4) clock.ms = row.next_check_at + 1
  }
  assert.deepEqual(waits, [6, 24, 72, 168, 168])
  const onlineCalls = calls.filter((name) => name === 'online').length
  await resolver.resolve({ title: 'Nowhere Show' })
  assert.equal(calls.filter((name) => name === 'online').length, onlineCalls)
  guide = ['guide:new']
  const found = await resolver.resolve({ title: 'Nowhere Show' })
  assert.deepEqual([found.stage, found.origin], ['guide', 'guide:new'])
  assert.equal((store.rows.get('series|landscape|nowhere show').next_check_at - clock.ms) / HOUR, 168)
})

test('the owner choice comes first and is never saved as a resolution', async () => {
  const { resolver, store } = resolverWith({
    stages: { choice: async () => ({ sources: ['upload:abc'] }), plex: async () => ({ sources: ['plex:/art'] }) },
    sizes: { 'plex:/art': WIDE },
  })
  assert.deepEqual(await resolver.resolve({ title: 'The Block', shape: 'poster' }), { stage: 'choice', origin: 'upload:abc', transform: 'none', pending: false, kind: 'series' })
  assert.equal((await resolver.resolve({ title: 'The Block' })).transform, 'pad')
  assert.equal(store.rows.size, 0)
})

test('guide-only chain: the airing picture, then other airings, then the title chain, then no picture', async () => {
  const run = async ({ own = null, sameTitle = [], titleSources = [] }) => {
    const { resolver } = resolverWith({
      stages: {
        own: async ({ ownSource }) => ({ sources: [ownSource].filter(Boolean) }),
        'same-title': async ({ sameTitleSources }) => ({ sources: sameTitleSources }),
        plex: async () => ({ sources: titleSources }),
      },
      sizes: { 'guide:own': SMALL_POSTER, 'guide:other': WIDE, 'plex:/art': WIDE },
    })
    const found = await resolver.resolve({ title: 'Bluey', eventId: '7', ownSource: own, sameTitleSources: sameTitle })
    return [found.stage, found.origin]
  }
  assert.deepEqual(await run({ own: 'guide:own', sameTitle: ['guide:other'] }), ['own', 'guide:own'])
  assert.deepEqual(await run({ sameTitle: ['guide:other'] }), ['same-title', 'guide:other'])
  assert.deepEqual(await run({ titleSources: ['plex:/art'] }), ['plex', 'plex:/art'])
  assert.deepEqual(await run({}), ['none', null])
})

test('episode chain: the recording picture, then the series picture, then no picture', async () => {
  const { resolver } = resolverWith({
    stages: {
      episode: async ({ recordingId }) => ({ sources: [`recording:${recordingId}`] }),
      plex: async () => ({ sources: ['plex:/art'] }),
    },
    sizes: { 'recording:r1': WIDE, 'plex:/art': WIDE },
  })
  assert.equal((await resolver.resolve({ title: 'Bluey', recordingId: 'r1' })).origin, 'recording:r1')
  assert.equal((await resolver.resolve({ title: 'Bluey', recordingId: 'r2' })).origin, 'plex:/art')
})

const episodeFrameStages = () => ({
  plex: async () => ({ sources: ['plex:/art'] }),
  frame: async ({ recordingId }) => ({ sources: [recordingId ? `frame:${recordingId}` : 'frame:newest'] }),
})

test('episode pictures: series picture first by default; the setting puts the episode frame first', async () => {
  const sizes = { 'plex:/art': WIDE, 'frame:r2': WIDE, 'frame:newest': WIDE }
  const { resolver } = resolverWith({ stages: episodeFrameStages(), sizes })
  assert.equal((await resolver.resolve({ title: 'Bluey', recordingId: 'r2' })).origin, 'plex:/art')
  assert.equal((await resolver.resolve({ title: 'Bluey', recordingId: 'r2', episodeOrder: 'series' })).origin, 'plex:/art')
  const framed = await resolver.resolve({ title: 'Bluey', recordingId: 'r2', episodeOrder: 'frame' })
  assert.deepEqual([framed.stage, framed.origin], ['frame', 'frame:r2'])
})

test('episode pictures: the title step uses the newest episode frame, never the episode one', async () => {
  const { resolver } = resolverWith({
    stages: { frame: episodeFrameStages().frame },
    sizes: { 'frame:r2': WIDE, 'frame:newest': WIDE },
  })
  const result = await resolver.resolve({ title: 'Bluey', recordingId: 'r2' })
  assert.deepEqual([result.stage, result.origin], ['frame', 'frame:newest'])
})

test('frame step: a series with no other picture gets its newest frame; a poster pads it', async () => {
  const { resolver, calls } = resolverWith({
    stages: { online: async () => ({ sources: [] }), frame: async () => ({ sources: ['frame:newest'] }) },
    sizes: { 'frame:newest': WIDE },
  })
  const wide = await resolver.resolve({ title: 'Bluey', kind: 'series' })
  assert.deepEqual([wide.stage, wide.origin, wide.transform], ['frame', 'frame:newest', 'none'])
  assert.deepEqual(calls.slice(0, 2), ['online', 'frame'])
  const poster = await resolver.resolve({ title: 'Bluey', kind: 'series', shape: 'poster' })
  assert.deepEqual([poster.stage, poster.origin, poster.transform], ['derived', 'frame:newest', 'pad'])
})

test('frame step: a one-off takes its frame before any online lookup', async () => {
  const { resolver, calls } = resolverWith({
    stages: { online: async () => ({ sources: ['https://online/wide.jpg'] }), frame: async () => ({ sources: ['frame:f1'] }) },
    sizes: { 'frame:f1': WIDE, 'https://online/wide.jpg': WIDE },
  })
  assert.equal((await resolver.resolve({ title: 'The Ashes', kind: 'one-off' })).origin, 'frame:f1')
  assert.deepEqual(calls, ['frame'])
})

test('frame step: a frame still grabbing makes the answer pending and saves nothing', async () => {
  const { resolver, store } = resolverWith({ stages: { frame: async () => ({ sources: [], pending: true }) } })
  assert.equal((await resolver.resolve({ title: 'Bluey', kind: 'series' })).pending, true)
  assert.equal(store.rows.size, 0)
})

test('a stage that runs past the time budget makes the answer pending', async () => {
  const { resolver } = resolverWith({
    budgetMs: 20,
    stages: { plex: () => new Promise(() => {}) },
  })
  assert.equal((await resolver.resolve({ title: 'Slow Show' })).pending, true)
})

test('portraitPadOf: a landscape picture becomes a 2:3 poster with the picture across its middle', async () => {
  const body = await sharp({ create: { ...OBSESSION_THUMB, channels: 3, background: '#335577' } }).jpeg().toBuffer()
  const padded = await portraitPadOf({ body, contentType: 'image/jpeg' })
  const { width, height } = await sharp(padded.body).metadata()
  assert.deepEqual([width, height], [720, 1080])
  const poster = { body: await sharp({ create: { ...POSTER, channels: 3, background: '#335577' } }).jpeg().toBuffer() }
  assert.equal(await portraitPadOf(poster), poster)
})

test('showImageUrlOf: one builder for every show picture URL, with kind hint and stamp', () => {
  assert.equal(showImageUrlOf({ title: 'Fargo', shape: 'poster', kind: artKindHintOf('series'), width: 384, stamp: 'k2' }), '/api/epg/show-image?title=Fargo&shape=poster&kind=series&w=384&c=k2')
  assert.deepEqual(['movie', 'series', 'oneoff', 'other'].map(artKindHintOf), ['movie', 'series', 'one-off', null])
})

const recorder = () => {
  const res = { statusCode: 200, headers: {}, body: null }
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value }
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.send = (sent) => { res.body = sent }
  res.end = () => res
  return res
}

test('a final miss answers 404 no-store with X-Art-State final, a pending one with pending, and TitleArt stops only on final', async () => {
  const serveWith = (result) => serveImageRoute({ route: imageRouteOf({ path: '/api/epg/show-image', widthOf: () => 192, loadImage: async () => result }), imageMaxAgeS: 86400 })
  for (const [result, state] of [[{ image: null, pending: false, final: true }, 'final'], [{ image: null, pending: true }, 'pending'], [null, undefined]]) {
    const res = recorder()
    await serveWith(result)({ params: {}, query: {}, headers: {} }, res)
    assert.deepEqual([res.statusCode, res.headers['cache-control'], res.headers['x-art-state']], [404, 'no-store', state])
  }
  assert.equal(artProbeStateOf({ ok: false, state: 'final' }), 'final')
  assert.equal(artProbeStateOf({ ok: false, state: 'pending' }), 'pending')
  assert.equal(artProbeStateOf({ ok: false, state: null }), 'pending')
  assert.equal(artProbeStateOf({ ok: true, state: null }), 'loaded')
})

test('a Plex 503 never saves a lower pick for long: the online pick lives 5 min, then Plex art comes back', async () => {
  let plexDown = true
  const { resolver, store, clock } = resolverWith({
    stages: { plex: async () => ({ sources: ['plex:/art'] }), online: async () => ({ sources: ['https://tvmaze.test/bg.jpg'] }) },
    sizes: { 'plex:/art': WIDE, 'https://tvmaze.test/bg.jpg': WIDE },
    loadImage: async (origin) => {
      if (origin === 'plex:/art' && plexDown) throw new Error('Plex HTTP 503')
      return { body: Buffer.from(origin) }
    },
  })
  const during = await resolver.resolve({ title: 'Bluey' })
  assert.equal(during.origin, 'https://tvmaze.test/bg.jpg')
  assert.equal((store.rows.get('series|landscape|bluey').next_check_at - clock.ms) / 60000, 5)
  plexDown = false
  clock.ms += 5 * 60 * 1000 + 1
  assert.equal((await resolver.resolve({ title: 'Bluey' })).origin, 'plex:/art')
})

test('a Plex error with nothing else that fits answers pending and saves no miss', async () => {
  const { resolver, store } = resolverWith({
    stages: { plex: async () => ({ sources: ['plex:/art'] }) },
    loadImage: async () => { throw new Error('Plex timed out') },
  })
  assert.equal((await resolver.resolve({ title: 'Bluey' })).pending, true)
  assert.equal(store.rows.size, 0)
})

test('an origin that carries a Plex token is never saved', async () => {
  const { resolver, store } = resolverWith({
    stages: { online: async () => ({ sources: ['http://plex:32400/library/metadata/1/art?X-Plex-Token=secret'] }) },
    sizes: { 'http://plex:32400/library/metadata/1/art?X-Plex-Token=secret': WIDE },
  })
  await resolver.resolve({ title: 'Bluey' })
  assert.equal([...store.rows.values()].some((row) => /X-Plex-Token/i.test(row.origin ?? '')), false)
})

test('a first picture tells listeners with no stamp, and a changed picture gets a saved stamp that stampsByKey lists', async () => {
  const resolved = []
  const sources = { plex: ['plex:/old'] }
  const { resolver, store, clock } = resolverWith({
    stages: { plex: async () => ({ sources: sources.plex }) },
    sizes: { 'plex:/old': WIDE, 'plex:/new': WIDE },
    onResolved: (change) => resolved.push(change),
  })
  await resolver.resolve({ title: 'The Block' })
  assert.deepEqual(resolved, [{ key: 'the-block', kind: 'background', stamp: null }])
  assert.equal(store.rows.get('series|landscape|block').show_key, 'the-block')
  await resolver.resolve({ title: 'The Block' })
  assert.equal(resolved.length, 1)
  sources.plex = ['plex:/new']
  clock.ms += 1
  await resolver.resolve({ title: 'The Block' })
  const stamp = pictureStampOf({ origin: 'plex:/new', transform: 'none' })
  assert.deepEqual(resolved[1], { key: 'the-block', kind: 'background', stamp })
  assert.deepEqual(Object.fromEntries(await resolver.stampsByKey()), { 'the-block': { background: stamp } })
})

test('pictureChangeOf: a stamp only when the browser may hold an older picture, and kept while the picture stays', () => {
  const hit = { origin: 'plex:/a', transform: 'none' }
  const none = { origin: null, transform: 'none' }
  assert.deepEqual(pictureChangeOf({ saved: null, result: hit }), { changed: true, stamp: null })
  assert.deepEqual(pictureChangeOf({ saved: null, result: none }), { changed: false, stamp: null })
  assert.deepEqual(pictureChangeOf({ saved: { ...none }, result: hit }), { changed: true, stamp: null })
  assert.deepEqual(pictureChangeOf({ saved: { ...hit, stamp: 's1' }, result: hit }), { changed: false, stamp: 's1' })
  assert.deepEqual(pictureChangeOf({ saved: hit, result: none }), { changed: true, stamp: pictureStampOf(none) })
  assert.deepEqual(pictureChangeOf({ saved: { ...none, stamp: 's1' }, result: hit }), { changed: true, stamp: pictureStampOf(hit) })
  assert.match(pictureStampOf(hit), /^[0-9a-f]{10}$/)
})

test('a pending answer asks again in the background until the picture resolves, then tells listeners', async () => {
  const resolved = []
  const online = { sources: [], pending: true }
  const { resolver } = resolverWith({
    stages: { online: async () => online },
    sizes: { 'https://example.com/wide.jpg': WIDE },
    onResolved: (change) => resolved.push(change),
    followUpDelaysMs: [1, 1, 1],
  })
  assert.equal((await resolver.resolve({ title: 'Bluey' })).pending, true)
  online.sources = ['https://example.com/wide.jpg']
  online.pending = false
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.deepEqual(resolved, [{ key: 'bluey', kind: 'background', stamp: null }])
})

test('restart cold: a pending answer that later resolves to the saved picture still tells listeners once', async () => {
  const resolved = []
  const store = memoryStore()
  const plex = { sources: ['plex:/art'], pending: false }
  const first = resolverWith({ store, stages: { plex: async () => plex }, sizes: { 'plex:/art': WIDE } })
  await first.resolver.resolve({ title: 'Bluey' })
  plex.pending = true
  const { resolver } = resolverWith({
    store,
    stages: { plex: async () => plex },
    sizes: { 'plex:/art': WIDE },
    onResolved: (change) => resolved.push(change),
    followUpDelaysMs: [1, 1, 1],
  })
  assert.equal((await resolver.resolve({ title: 'Bluey' })).pending, true)
  plex.pending = false
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.deepEqual(resolved, [{ key: 'bluey', kind: 'background', stamp: null }])
  await resolver.resolve({ title: 'Bluey' })
  assert.equal(resolved.length, 1)
})

test('a guide airing whose own image times out asks again in the background and tells listeners when it loads', async () => {
  const resolved = []
  let slow = true
  const { resolver } = resolverWith({
    stages: { own: async ({ ownSource }) => ({ sources: [ownSource] }) },
    loadImage: async (origin) => {
      if (slow) await new Promise((resolve) => setTimeout(resolve, 50))
      return { body: Buffer.from(origin) }
    },
    now: Date.now,
    outerBudgetMs: 5,
    onResolved: (change) => resolved.push(change),
    followUpDelaysMs: [60, 60, 60],
  })
  assert.equal((await resolver.resolve({ title: 'Gruen', eventId: 'e1', ownSource: 'https://example.com/e1.jpg' })).pending, true)
  slow = false
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.deepEqual(resolved, [{ key: 'gruen', kind: 'background', stamp: null }])
})

test('episodePictureOrderFrom: stills when nothing else unless the setting says off or frame first; old values keep their meaning', () => {
  assert.equal(episodePictureOrderFrom(null), 'series')
  assert.equal(episodePictureOrderFrom('nonsense'), 'series')
  assert.equal(episodePictureOrderFrom('series'), 'series')
  assert.equal(episodePictureOrderFrom('frame'), 'frame')
  assert.equal(episodePictureOrderFrom('off'), 'off')
})

test('stills off: the episode chain has no frame step', () => {
  assert.deepEqual(chainOf({ kind: 'series', recordingId: 'r1', episodeOrder: 'off' }), ['episode', 'title', 'none'])
  assert.equal(stillsAllowed('off'), false)
  assert.equal(stillsAllowed('series'), true)
  assert.equal(stillsAllowed('frame'), true)
})

test('isGuessedFilmKind: a film kind from the guide only, never from the library or the owner', () => {
  assert.equal(isGuessedFilmKind({}), true)
  assert.equal(isGuessedFilmKind({ libraryKinds: ['series'] }), true)
  assert.equal(isGuessedFilmKind({ libraryKinds: ['movie'] }), false)
  assert.equal(isGuessedFilmKind({ override: 'movie' }), false)
})

test('onlineArtworkOf: a guessed film with no film match asks again as a series (Eurovision Song Contest Asia 2026)', async () => {
  const asked = []
  const lookUps = ({ film, series, guessed }) => ({
    lookUpFilm: async () => { asked.push('film'); return film },
    lookUpSeries: async () => { asked.push('series'); return series },
    isGuessedFilm: async () => guessed,
  })
  const none = { sources: [], pending: false, settled: true }
  const backdrop = { sources: ['https://image.tmdb.org/t/p/original/esc-asia.jpg'], pending: false }
  assert.deepEqual(await onlineArtworkOf({ kind: 'movie', ...lookUps({ film: none, series: backdrop, guessed: true }) }), backdrop)
  assert.deepEqual(asked, ['film', 'series'])
  asked.length = 0
  assert.deepEqual(await onlineArtworkOf({ kind: 'movie', ...lookUps({ film: none, series: backdrop, guessed: false }) }), none)
  assert.deepEqual(asked, ['film'])
  asked.length = 0
  const waiting = { sources: [], pending: true }
  assert.deepEqual(await onlineArtworkOf({ kind: 'movie', ...lookUps({ film: waiting, series: backdrop, guessed: true }) }), waiting)
  assert.deepEqual(asked, ['film'])
  asked.length = 0
  assert.deepEqual(await onlineArtworkOf({ kind: 'series', ...lookUps({ film: none, series: backdrop, guessed: true }) }), backdrop)
  assert.deepEqual(asked, ['series'])
})

test('a guessed film resolves to the series picture the series lookup finds, and saves it', async () => {
  const { resolver, store } = resolverWith({
    guideKind: 'movie',
    stages: {
      online: ({ kind }) => onlineArtworkOf({
        kind,
        lookUpFilm: async () => ({ sources: [], pending: false, settled: true }),
        lookUpSeries: async () => ({ sources: ['https://tmdb/esc-asia-backdrop.jpg'], pending: false }),
        isGuessedFilm: async () => isGuessedFilmKind({ libraryKinds: [] }),
      }),
    },
    sizes: { 'https://tmdb/esc-asia-backdrop.jpg': WIDE },
  })
  const result = await resolver.resolve({ title: 'Eurovision Song Contest Asia 2026' })
  assert.equal(result.kind, 'movie')
  assert.deepEqual([result.stage, result.origin], ['online', 'https://tmdb/esc-asia-backdrop.jpg'])
  assert.equal([...store.rows.values()][0].origin, 'https://tmdb/esc-asia-backdrop.jpg')
})

test('episode frame first: a series picture while the frame is still grabbing is provisional, and the frame tells listeners when it arrives', async () => {
  const frame = { ready: false }
  const resolved = []
  const { resolver } = resolverWith({
    stages: {
      plex: async () => ({ sources: ['plex:/art'] }),
      frame: async ({ recordingId }) => (recordingId && !frame.ready ? { sources: [], pending: true } : { sources: recordingId ? [`frame:${recordingId}`] : [] }),
    },
    sizes: { 'plex:/art': WIDE, 'frame:r2': WIDE },
    onResolved: (change) => resolved.push(change),
  })
  const first = await resolver.resolve({ title: 'Bluey', recordingId: 'r2', episodeOrder: 'frame' })
  assert.deepEqual([first.origin, first.provisional], ['plex:/art', true])
  resolved.length = 0
  frame.ready = true
  const later = await resolver.resolve({ title: 'Bluey', recordingId: 'r2', episodeOrder: 'frame' })
  assert.deepEqual([later.origin, later.provisional], ['frame:r2', undefined])
  assert.deepEqual(resolved, [{ key: 'bluey', kind: 'background', stamp: null }])
})

test('a provisional picture is served with no-cache, a final one for a day', async () => {
  const serve = (result) => serveImageRoute({
    imageMaxAgeS: 86400,
    route: imageRouteOf({ path: '/x', widthOf: () => 384, loadImage: async () => result }),
  })
  const recorder = () => {
    const res = { headers: {}, statusCode: 200 }
    res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value }
    res.status = (code) => { res.statusCode = code; return res }
    res.send = (body) => { res.body = body; return res }
    res.end = () => res
    res.json = () => res
    return res
  }
  const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } }).jpeg().toBuffer()
  const image = { body: jpeg, contentType: 'image/jpeg' }
  const provisional = recorder()
  await serve({ image, pending: false, provisional: true })({ params: {}, query: {} }, provisional)
  assert.equal(provisional.headers['cache-control'], 'no-cache')
  const settled = recorder()
  await serve({ image, pending: false })({ params: {}, query: {} }, settled)
  assert.equal(settled.headers['cache-control'], 'public, max-age=86400')
})

test('onlineArtworkOf: a film lookup that was refused or failed recently waits; the lookup switch off keeps the film answer', async () => {
  const asked = []
  const lookUps = (film) => ({
    lookUpFilm: async () => film,
    lookUpSeries: async () => { asked.push('series'); return { sources: ['https://tmdb/series.jpg'], pending: false } },
    isGuessedFilm: async () => true,
  })
  assert.deepEqual(await onlineArtworkOf({ kind: 'movie', ...lookUps({ sources: [], pending: false }) }), { sources: [], pending: true })
  const off = { sources: [], pending: false, off: true }
  assert.deepEqual(await onlineArtworkOf({ kind: 'movie', ...lookUps(off) }), off)
  assert.deepEqual(asked, [])
})

test('a guessed film whose film lookup has not settled saves nothing, so a real film never keeps series art', async () => {
  const { resolver, store } = resolverWith({
    guideKind: 'movie',
    stages: {
      online: ({ kind }) => onlineArtworkOf({
        kind,
        lookUpFilm: async () => ({ sources: [], pending: false }),
        lookUpSeries: async () => ({ sources: ['https://tmdb/fargo-series.jpg'], pending: false }),
        isGuessedFilm: async () => true,
      }),
    },
    sizes: { 'https://tmdb/fargo-series.jpg': WIDE },
  })
  assert.equal((await resolver.resolve({ title: 'Fargo' })).pending, true)
  assert.equal(store.rows.size, 0)
})

test('guide step: the saved copy of a guide picture comes before the live guide address', async () => {
  const saved = 'guide-picture:0123456789abcdef01234567-v1'
  const live = 'https://images.example.com/gruen.jpg'
  assert.deepEqual(guideSourcesOf({ saved, live: [live, saved] }), [saved, live])
  assert.deepEqual(guideSourcesOf({ live: [live] }), [live])
  const run = async (sizes) => {
    const { resolver } = resolverWith({ stages: { guide: async () => ({ sources: guideSourcesOf({ saved, live: [live] }) }) }, sizes })
    return (await resolver.resolve({ title: 'Gruen' })).origin
  }
  assert.equal(await run({ [saved]: WIDE, [live]: WIDE }), saved)
  assert.equal(await run({ [live]: WIDE }), live)
})

test('guide airing chain: the airing picture, its saved copy, the title copy, other airings, Freeview, then the title chain', async () => {
  const own = 'https://images.example.com/episode-2.jpg'
  const ownCopy = 'guide-picture:aaaaaaaaaaaaaaaaaaaaaaaa-v1'
  const titleCopy = 'guide-picture:bbbbbbbbbbbbbbbbbbbbbbbb-v2'
  const run = async ({ sizes, freeview = null }) => {
    const { resolver } = resolverWith({
      stages: {
        own: async ({ ownSource }) => ({ sources: [ownSource, ownCopy] }),
        saved: async () => ({ sources: [titleCopy] }),
        'same-title': async () => ({ sources: [] }),
        freeview: async () => ({ sources: [freeview].filter(Boolean) }),
      },
      sizes,
    })
    const found = await resolver.resolve({ title: 'Bluey', eventId: '7', ownSource: own })
    return [found.stage, found.origin]
  }
  assert.deepEqual(await run({ sizes: { [own]: WIDE, [ownCopy]: WIDE, [titleCopy]: WIDE } }), ['own', own])
  assert.deepEqual(await run({ sizes: { [ownCopy]: WIDE, [titleCopy]: WIDE } }), ['own', ownCopy])
  assert.deepEqual(await run({ sizes: { [titleCopy]: WIDE } }), ['saved', titleCopy])
  assert.deepEqual(await run({ sizes: { 'https://freeview.example.com/1.jpg': WIDE }, freeview: 'https://freeview.example.com/1.jpg' }), ['freeview', 'https://freeview.example.com/1.jpg'])
})

test('guide airing chain in Australia: Freeview first, then the airing picture, its saved copy, the title copy, other airings', async () => {
  const freeviewCopy = 'guide-picture:cccccccccccccccccccccccc-v3'
  const freeviewLive = 'https://img-store-prod.switch.tv/images/bluey.jpg'
  const own = 'https://images.example.com/episode-2.jpg'
  const ownCopy = 'guide-picture:aaaaaaaaaaaaaaaaaaaaaaaa-v1'
  const titleCopy = 'guide-picture:bbbbbbbbbbbbbbbbbbbbbbbb-v2'
  const sameTitle = 'https://images.example.com/episode-3.jpg'
  const run = async ({ sizes, freeview = [], freeviewFirst = true }) => {
    const { resolver, calls } = resolverWith({
      stages: {
        freeview: async () => ({ sources: freeview }),
        own: async ({ ownSource }) => ({ sources: [ownSource, ownCopy] }),
        saved: async () => ({ sources: [titleCopy] }),
        'same-title': async () => ({ sources: [sameTitle] }),
      },
      sizes,
    })
    const found = await resolver.resolve({ title: 'Bluey', eventId: '7', ownSource: own, freeviewFirst })
    return { picked: [found.stage, found.origin], calls }
  }
  const everything = { [freeviewCopy]: WIDE, [freeviewLive]: WIDE, [own]: WIDE, [ownCopy]: WIDE, [titleCopy]: WIDE, [sameTitle]: WIDE }
  const matched = [freeviewCopy, freeviewLive]
  assert.deepEqual((await run({ sizes: everything, freeview: matched })).picked, ['freeview', freeviewCopy])
  assert.deepEqual((await run({ sizes: { ...everything, [freeviewCopy]: null }, freeview: matched })).picked, ['freeview', freeviewLive])
  assert.deepEqual((await run({ sizes: everything, freeview: matched, freeviewFirst: false })).picked, ['own', own])
  const noMatch = await run({ sizes: everything })
  assert.deepEqual(noMatch.picked, ['own', own])
  assert.deepEqual(noMatch.calls, ['freeview', 'own'])
  assert.deepEqual((await run({ sizes: { [ownCopy]: WIDE, [titleCopy]: WIDE }, freeview: matched })).picked, ['own', ownCopy])
  assert.deepEqual((await run({ sizes: { [titleCopy]: WIDE, [sameTitle]: WIDE } })).picked, ['saved', titleCopy])
  assert.deepEqual((await run({ sizes: { [sameTitle]: WIDE } })).picked, ['same-title', sameTitle])
})

test('guide airing chain in Australia: an airing with no Freeview match takes the Freeview title copy before its own picture', async () => {
  const freeviewTitle = 'guide-picture:dddddddddddddddddddddddd-v4'
  const own = 'https://images.example.com/episode-9.jpg'
  const run = async ({ titleCopy }) => {
    const { resolver } = resolverWith({
      stages: {
        freeview: async () => ({ sources: [] }),
        'freeview-title': async () => ({ sources: [titleCopy].filter(Boolean) }),
        own: async ({ ownSource }) => ({ sources: [ownSource] }),
      },
      sizes: { [freeviewTitle]: WIDE, [own]: WIDE },
    })
    const found = await resolver.resolve({ title: 'Gruen', eventId: '9', ownSource: own, freeviewFirst: true })
    return [found.stage, found.origin]
  }
  assert.deepEqual(await run({ titleCopy: freeviewTitle }), ['freeview-title', freeviewTitle])
  assert.deepEqual(await run({ titleCopy: null }), ['own', own])
})

test('Freeview airing pictures: the episode picture comes before the show picture', () => {
  assert.deepEqual(freeviewAiringOriginsOf({ episode: ['guide-picture:e', 'https://fv/e.jpg'], show: ['https://fv/s.jpg'] }), ['guide-picture:e', 'https://fv/e.jpg', 'https://fv/s.jpg'])
  assert.deepEqual(freeviewAiringOriginsOf({}), [])
})

test('recordingPictureOrderOf: the Freeview episode picture, the airing picture, Freeview show art, the Freeview title copy, other airings', () => {
  assert.deepEqual(recordingPictureOrderOf({
    freeviewEpisode: ['https://fv/e.jpg'],
    own: 'https://guide/own.jpg',
    freeviewShow: ['https://fv/s.jpg'],
    freeviewTitle: 'guide-picture:t',
    sameTitle: ['https://guide/other.jpg'],
  }), ['https://fv/e.jpg', 'https://guide/own.jpg', 'https://fv/s.jpg', 'guide-picture:t', 'https://guide/other.jpg'])
  assert.deepEqual(recordingPictureOrderOf({ own: 'https://guide/own.jpg', sameTitle: ['https://guide/other.jpg'] }), ['https://guide/own.jpg', 'https://guide/other.jpg'])
})

test('programmeWarmOriginsOf: every origin the chain can serve with Freeview, the old set without it', () => {
  const base = { own: 'own', ownCopy: 'own-copy', titleCopy: 'title-copy', sameTitle: ['other'] }
  assert.deepEqual(programmeWarmOriginsOf({ ...base, freeview: ['fv-e', 'fv-s'], freeviewTitle: 'fv-t' }), ['fv-e', 'fv-s', 'fv-t', 'own', 'own-copy', 'title-copy', 'other'])
  assert.deepEqual(programmeWarmOriginsOf({ ...base, freeviewTitle: 'fv-t' }), ['fv-t', 'own', 'own-copy', 'title-copy', 'other'])
  assert.deepEqual(programmeWarmOriginsOf(base), ['own', 'own-copy'])
  assert.deepEqual(programmeWarmOriginsOf({ ...base, own: null, ownCopy: null }), ['title-copy', 'other'])
})

test('guide step: a Freeview title copy comes first, then the copy from the guide host, then the live addresses', async () => {
  const freeviewCopy = 'guide-picture:cccccccccccccccccccccccc-v3'
  const guideCopy = 'guide-picture:bbbbbbbbbbbbbbbbbbbbbbbb-v2'
  const live = 'https://images.example.com/gruen.jpg'
  assert.deepEqual(guideSourcesOf({ saved: [freeviewCopy, guideCopy], live: [live, guideCopy] }), [freeviewCopy, guideCopy, live])
  const run = async (sizes) => {
    const { resolver } = resolverWith({ stages: { guide: async () => ({ sources: guideSourcesOf({ saved: [freeviewCopy, guideCopy], live: [live] }) }) }, sizes })
    return (await resolver.resolve({ title: 'Gruen' })).origin
  }
  assert.equal(await run({ [freeviewCopy]: WIDE, [guideCopy]: WIDE, [live]: WIDE }), freeviewCopy)
  assert.equal(await run({ [freeviewCopy]: { width: 400, height: 225 }, [guideCopy]: WIDE }), guideCopy)
})

test('peek: due with no row or a due retry, else the saved or chosen picture, with only the local steps run', async () => {
  const { resolver, calls, clock } = resolverWith({
    stages: { plex: async () => ({ sources: ['plex:/wide'] }) },
    sizes: { 'plex:/wide': WIDE },
  })
  assert.deepEqual(await resolver.peek({ title: 'Bluey' }), { due: true })
  await resolver.resolve({ title: 'Bluey' })
  calls.length = 0
  assert.deepEqual(await resolver.peek({ title: 'Bluey' }), { due: false, stage: 'plex', origin: 'plex:/wide', transform: 'none', pending: false })
  assert.deepEqual(calls, ['plex'])
  clock.ms += 8 * 24 * HOUR
  assert.deepEqual(await resolver.peek({ title: 'Bluey' }), { due: true })
  const chosen = resolverWith({ stages: { choice: async () => ({ sources: ['upload:1'] }) } })
  assert.deepEqual(await chosen.resolver.peek({ title: 'Bluey', shape: 'poster' }), { due: false, stage: 'choice', origin: 'upload:1', transform: 'none' })
})

test('peek: due when the local evidence changed since the saved row, so a new recording picture is warmed', async () => {
  let recordingSources = []
  const { resolver } = resolverWith({
    stages: { recording: async () => ({ sources: recordingSources }), online: async () => ({ sources: [] }) },
    sizes: { 'recording:9': WIDE },
  })
  await resolver.resolve({ title: 'Gogglebox' })
  assert.equal((await resolver.peek({ title: 'Gogglebox' })).due, false)
  recordingSources = ['recording:9']
  assert.deepEqual(await resolver.peek({ title: 'Gogglebox' }), { due: true })
  await resolver.resolve({ title: 'Gogglebox' })
  assert.deepEqual(await resolver.peek({ title: 'Gogglebox' }), { due: false, stage: 'recording', origin: 'recording:9', transform: 'none', pending: false })
})
