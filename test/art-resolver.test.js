import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'

import {
  EPISODE_CHAIN,
  GUIDE_ONLY_CHAIN,
  TITLE_CHAINS,
  canonicalKindOf,
  chainOf,
  createArtResolver,
  guideKindsOf,
} from '../src/art-resolver.js'
import { titleCardSvg, titleFontPxOf, titleLinesOf, textWidthOf } from '../src/art-card.js'
import { cardWantedFrom, imageRouteOf, serveImageRoute } from '../src/image-routes.js'
import { rasterizeSvg } from '../src/image-thumbnails.js'
import { isRenderableSvg } from '../src/raster-type.js'
import { portraitPadOf } from '../src/show-poster.js'
import { artKindHintOf, showImageUrlOf } from '../src/web/artwork-stamps.js'
import { artHueOf } from '../src/web/art-fallback.js'

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

test('chainOf: each kind runs its own chain, from the owner choice to the title card', () => {
  const table = [
    [{ kind: 'movie' }, ['choice', 'plex', 'recording', 'guide', 'online', 'derived', 'frame', 'card']],
    [{ kind: 'series' }, ['choice', 'plex', 'recording', 'guide', 'online', 'derived', 'frame', 'card']],
    [{ kind: 'one-off' }, ['choice', 'plex', 'recording', 'guide', 'frame', 'online', 'derived', 'card']],
    [{ kind: 'series', recordingId: 'r1' }, ['episode', 'title', 'frame', 'card']],
    [{ kind: 'movie', eventId: 'e1' }, ['own', 'same-title', 'title', 'card']],
    [{ kind: 'unknown' }, TITLE_CHAINS.series],
  ]
  for (const [request, chain] of table) assert.deepEqual(chainOf(request), chain, JSON.stringify(request))
  assert.equal(chainOf({ kind: 'series', recordingId: 'r1' }), EPISODE_CHAIN)
  assert.equal(chainOf({ kind: 'series', eventId: 'e1' }), GUIDE_ONLY_CHAIN)
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

test('the title card is the last step; it is saved with a 6 h to 7 d retry ladder, and new evidence retries at once', async () => {
  let guide = []
  const { resolver, store, clock, calls } = resolverWith({
    stages: { guide: async () => ({ sources: guide }), online: async () => ({ sources: [] }) },
    sizes: { 'guide:new': WIDE },
  })
  const waits = []
  for (let round = 0; round < 5; round += 1) {
    const found = await resolver.resolve({ title: 'Nowhere Show' })
    assert.equal(found.stage, 'card')
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

test('guide-only chain: the airing picture, then other airings, then the title chain, then the card', async () => {
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
  assert.deepEqual(await run({}), ['card', null])
})

test('episode chain: the recording picture, then the series picture, then the card', async () => {
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

test('title card: the same hue as the page fallback, balanced lines with no lone last word, and a clamp at three lines', () => {
  const { body } = titleCardSvg({ title: 'The Great Australian Bake Off', shape: 'poster' })
  const svg = body.toString()
  assert.ok(isRenderableSvg(body))
  assert.match(svg, /viewBox="0 0 120 180"/)
  assert.ok(svg.includes(`stop-color="${hexOfHue(artHueOf('The Great Australian Bake Off'))}"`))
  const lines = titleLinesOf({ title: 'Escape to the Country: Back to the Farm', maxWidth: 260 })
  assert.equal(lines.length, 2)
  assert.ok(lines.at(-1).split(' ').length > 1)
  const widths = lines.map((text) => textWidthOf({ text }))
  assert.ok(Math.abs(widths[0] - widths[1]) < 80)
  const clamped = titleLinesOf({ title: 'One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve', maxWidth: 80 })
  assert.equal(clamped.length, 3)
  assert.ok(clamped[2].endsWith('…'))
  assert.equal(titleFontPxOf({ title: 'Bluey', maxWidth: 84 }), 19)
  const shrunk = titleFontPxOf({ title: 'Gardening Australia', maxWidth: 84 })
  assert.ok(shrunk < 19 && shrunk >= 13)
  assert.equal(titleLinesOf({ title: 'Gardening Australia', maxWidth: 84, fontPx: shrunk }).length, 2)
  assert.deepEqual(titleLinesOf({ title: 'Supercalifragilisticexpialidocious', maxWidth: 80 }).every((line) => textWidthOf({ text: line }) <= 80), true)
})

test('title card: renders to a WebP of the asked width in each shape, with the year for a film and a channel logo', async () => {
  const logo = await sharp({ create: { width: 96, height: 48, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer()
  const poster = titleCardSvg({ title: 'Heat', shape: 'poster', year: 1995 })
  assert.equal((poster.body.toString().match(/fill-opacity/g) || []).length, 1)
  const wide = titleCardSvg({ title: 'Bluey', logo: { body: logo, width: 96, height: 48 } })
  assert.match(wide.body.toString(), /<image [^>]*href="data:image\/png;base64,/)
  for (const [card, width, height] of [[poster, 384, 576], [wide, 768, 432]]) {
    const rendered = await rasterizeSvg({ body: card.body, width })
    const size = await sharp(rendered.body).metadata()
    assert.deepEqual([size.format, size.width, size.height], ['webp', width, height])
  }
})

test('a generated card is sent with no-cache and an ETag, and a matching If-None-Match gets 304', async () => {
  const body = (await rasterizeSvg({ body: titleCardSvg({ title: 'Bluey' }).body, width: 192 })).body
  const route = imageRouteOf({ path: '/api/epg/show-image', widthOf: () => 192, loadImage: async () => ({ image: { body, contentType: 'image/webp', generated: true }, pending: false }) })
  const serve = serveImageRoute({ route, imageMaxAgeS: 86400 })
  const first = recorder()
  await serve({ params: {}, query: {}, headers: {} }, first)
  assert.equal(first.headers['cache-control'], 'no-cache')
  assert.ok(first.headers.etag)
  const again = recorder()
  await serve({ params: {}, query: {}, headers: { 'if-none-match': first.headers.etag } }, again)
  assert.equal(again.statusCode, 304)
  assert.equal(cardWantedFrom('0'), false)
  assert.equal(cardWantedFrom(undefined), true)
})

test('showImageUrlOf: one builder for every show picture URL, with kind hint, card switch, and stamp', () => {
  assert.equal(showImageUrlOf({ title: 'Fargo', shape: 'poster', kind: artKindHintOf('series'), width: 384, stamp: 'k2' }), '/api/epg/show-image?title=Fargo&shape=poster&kind=series&w=384&c=k2')
  assert.equal(showImageUrlOf({ title: 'Heat', width: 768, card: false }), '/api/epg/show-image?title=Heat&card=0&w=768')
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

const hexOfHue = (hue) => {
  const l = 0.44
  const chroma = 0.62 * Math.min(l, 1 - l)
  const channel = (offset) => {
    const k = (offset + hue / 30) % 12
    return Math.round((l - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

test('a series hero gets the 1280 px TVmaze background over a 400 px guide still; the still is used only when nothing fits', async () => {
  const still = { width: 400, height: 225 }
  const run = async (online) => {
    const { resolver } = resolverWith({
      guideKind: 'series',
      stages: { guide: async () => ({ sources: ['guide:still'] }), online: async () => ({ sources: online }) },
      sizes: { 'guide:still': still, 'https://tvmaze.test/bg.jpg': WIDE },
    })
    const found = await resolver.resolve({ title: 'The Block' })
    return [found.stage, found.origin]
  }
  assert.deepEqual(await run(['https://tvmaze.test/bg.jpg']), ['online', 'https://tvmaze.test/bg.jpg'])
  assert.deepEqual(await run([]), ['derived', 'guide:still'])
})

test('home hero: every title that had a hero-sized picture under the 2.12.3 chain still resolves to one', async () => {
  const fixture = [
    { title: 'Plex Show', plex: ['plex:/art'], sizes: { 'plex:/art': WIDE } },
    { title: 'Recorded Show', recording: ['recording:r1'], sizes: { 'recording:r1': { width: 960, height: 540 } } },
    { title: 'Small Recording Show', recording: ['recording:r2'], online: ['https://tvmaze.test/a.jpg'], sizes: { 'recording:r2': { width: 400, height: 225 }, 'https://tvmaze.test/a.jpg': WIDE } },
    { title: 'Guide Still Show', guide: ['guide:s'], online: ['https://tvmaze.test/b.jpg'], sizes: { 'guide:s': { width: 400, height: 225 }, 'https://tvmaze.test/b.jpg': WIDE } },
    { title: 'Online Film', kind: 'movie', online: ['https://tmdb.test/c.jpg'], sizes: { 'https://tmdb.test/c.jpg': WIDE } },
    { title: 'Portrait Plex Show', plex: ['plex:/thumb'], sizes: { 'plex:/thumb': POSTER } },
  ]
  const heroSized = []
  for (const item of fixture) {
    const { resolver } = resolverWith({
      stages: Object.fromEntries(['plex', 'recording', 'guide', 'online'].map((stage) => [stage, async () => ({ sources: item[stage] ?? [] })])),
      sizes: item.sizes,
    })
    const found = await resolver.resolve({ title: item.title, kind: item.kind })
    const size = item.sizes[found.origin]
    const shownWidth = found.transform === 'pad' ? Math.round(Math.min(size.height, 1080) * 16 / 9) : size?.width ?? 0
    if (shownWidth >= 640) heroSized.push(item.title)
  }
  assert.deepEqual(heroSized, fixture.map((item) => item.title))
})
