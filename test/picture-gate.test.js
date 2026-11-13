import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import knexFactory from 'knex'
import sharp from 'sharp'

import { up as upPictureChecks } from '../migrations/0049_picture_checks.js'
import { up as upPictureCheckMarks } from '../migrations/0051_picture_check_marks.js'
import { createArtResolver } from '../src/art-resolver.js'
import { GATE_RULE_VERSION, createPictureGate } from '../src/picture-gate.js'
import { createPlaceholderPictures, logoTraitsOf } from '../src/picture-placeholders.js'

const SEVEN_SHAPE = 'points="40,40 360,40 200,360 120,360 250,110 40,110"'
const sevenLogo = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><polygon ${SEVEN_SHAPE} fill="#e11"/></svg>`)).png().toBuffer()

const svgPicture = (body) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${body}</svg>`)).jpeg({ quality: 90 }).toBuffer()

const gradient = (from, to) => `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/>`

const sevenCard = (title) => svgPicture(`${gradient('#d0021b', '#e8303f')}
  <g transform="translate(60,60) scale(0.3)"><polygon ${SEVEN_SHAPE} fill="#fff"/></g>
  <rect x="60" y="330" width="${title.length * 22}" height="34" fill="#fff"/>`)

const badgeCard = (titleWidth) => svgPicture(`${gradient('#3a0508', '#4a0a0e')}
  <rect x="88" y="88" width="152" height="152" fill="#e2231a"/>
  <rect x="110" y="140" width="108" height="20" fill="#fff"/><rect x="130" y="176" width="70" height="20" fill="#fff"/>
  <rect x="88" y="330" width="${titleWidth}" height="34" fill="#fff"/>`)

const logoArt = () => svgPicture(`<rect width="1280" height="720" fill="#2d332c"/>
  <circle cx="640" cy="300" r="140" fill="none" stroke="#c33" stroke-width="18"/>
  <rect x="300" y="470" width="680" height="90" rx="20" fill="#f5f5f5"/>
  <rect x="380" y="590" width="520" height="40" fill="#ddd"/>`)

const sceneOf = async (seed) => {
  const width = 64
  const height = 36
  const pixels = Buffer.alloc(width * height * 3)
  for (let at = 0; at < pixels.length; at += 1) pixels[at] = (Math.sin(at * 0.37 * seed) * 127 + 128) & 0xff
  return sharp(pixels, { raw: { width, height, channels: 3 } }).resize(1280, 720).jpeg().toBuffer()
}

const cleanups = []
after(() => Promise.all(cleanups.map((cleanup) => cleanup())))

const memoryChecks = async () => {
  const database = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  await upPictureChecks(database)
  await upPictureCheckMarks(database)
  cleanups.push(() => database.destroy())
  const checks = createPlaceholderPictures({ database })
  checks.setLogos([await logoTraitsOf(sevenLogo)])
  return { database, checks }
}

const gateOver = ({ checks, images, recordingSources = {} }) => createPictureGate({
  checks,
  readers: {
    upload: async (origin) => images[origin] ?? null,
    frame: async (origin) => images[origin] ?? null,
    guideCopy: async (origin) => images[origin] ?? null,
    recording: async (id) => images[`recording:${id}`] ?? null,
    plex: async (origin) => images[origin] ?? null,
    url: async (source) => images[source] ?? null,
  },
  guideCopySourceOf: async (origin) => images[origin]?.source ?? null,
  recordingSourceOf: async (id) => recordingSources[id] ?? null,
})

const noStore = { read: async () => null, write: async () => {}, markDue: async () => [], stamped: async () => [] }

test('a channel title card is weak, a real logo-art picture stays ok, and a stand-in is never loaded', async () => {
  const { checks } = await memoryChecks()
  const images = {
    'https://img.example.com/fetch/bridge-of-lies': { body: await sevenCard('Bridge of Lies') },
    'https://img.example.com/fetch/farm-to-fork': { body: await logoArt() },
    'https://img.example.com/x/814112_default_program_image.png': { body: await sceneOf(9) },
  }
  const gate = gateOver({ checks, images })
  assert.deepEqual(await gate.screen('https://img.example.com/fetch/bridge-of-lies'), { verdict: 'weak', reason: 'card' })
  assert.equal((await gate.screen('https://img.example.com/fetch/farm-to-fork')).verdict, 'ok')
  assert.equal((await gate.load('https://img.example.com/fetch/bridge-of-lies')).verdict, 'weak')
  assert.equal(await gate.load('https://img.example.com/x/814112_default_program_image.png'), null)
})

test("Giddy Up's badge card is learned from other titles with the same badge, is weak, and loses to any real picture", async () => {
  const { checks } = await memoryChecks()
  const cards = {
    'https://img.example.com/fetch/giddy-up': ['Giddy Up', 140],
    'https://img.example.com/fetch/get-on-now': ['Get On Now', 200],
    'https://img.example.com/fetch/foxcatcher': ['Foxcatcher: On the Hunt', 320],
  }
  const images = {
    'https://img.example.com/freeview/giddy-up-small.jpg': { body: await sharp(await sceneOf(3)).resize(400, 225).jpeg().toBuffer() },
    'frame:giddy-up': { body: await sceneOf(4) },
  }
  for (const [source, [title, width]] of Object.entries(cards)) {
    images[source] = { body: await badgeCard(width) }
    checks.noteTitles([{ source, title }])
  }
  const gate = gateOver({ checks, images })
  for (const source of Object.keys(cards)) await gate.screen(source)
  assert.equal((await gate.screen('https://img.example.com/fetch/giddy-up')).verdict, 'weak')
  const resolveWith = (stages) => createArtResolver({ stages, loadImage: gate.load, store: noStore, followUpDelaysMs: [] })
    .resolve({ title: 'Giddy Up', kind: 'series' })
  const card = { sources: ['https://img.example.com/fetch/giddy-up'] }
  const small = await resolveWith({ guide: async () => ({ sources: [...card.sources, 'https://img.example.com/freeview/giddy-up-small.jpg'] }) })
  assert.deepEqual([small.stage, small.origin], ['derived', 'https://img.example.com/freeview/giddy-up-small.jpg'])
  const frame = await resolveWith({ guide: async () => card, frame: async () => ({ sources: ['frame:giddy-up'] }) })
  assert.deepEqual([frame.stage, frame.origin], ['frame', 'frame:giddy-up'])
  const alone = await resolveWith({ guide: async () => card })
  assert.deepEqual([alone.stage, alone.origin], ['weak', 'https://img.example.com/fetch/giddy-up'])
  const airing = await createArtResolver({
    stages: { own: async () => card, 'same-title': async () => ({ sources: ['https://img.example.com/freeview/giddy-up-small.jpg'] }) },
    loadImage: gate.load,
    store: noStore,
    followUpDelaysMs: [],
  }).resolve({ title: 'Giddy Up', eventId: '1' })
  assert.deepEqual([airing.stage, airing.origin], ['same-title', 'https://img.example.com/freeview/giddy-up-small.jpg'])
})

test('Big Brother, Home and Away, and Future House keep their Freeview pictures through the gate', async () => {
  const { checks } = await memoryChecks()
  const titles = ['Big Brother', 'Home and Away', "Jamie Durie's Future House"]
  const images = {}
  for (const [at, title] of titles.entries()) {
    const source = `https://img-store-prod.switch.tv/images/${at}/p${at}.jpg`
    images[source] = { body: await sceneOf(at + 11) }
    checks.noteTitles([{ source, title }])
  }
  const gate = gateOver({ checks, images })
  for (const [at, title] of titles.entries()) {
    const source = `https://img-store-prod.switch.tv/images/${at}/p${at}.jpg`
    assert.equal((await gate.screen(source)).verdict, 'ok')
    const found = await createArtResolver({
      stages: { freeview: async () => ({ sources: [source] }) },
      loadImage: gate.load,
      store: noStore,
      followUpDelaysMs: [],
    }).resolve({ title, eventId: String(at), freeviewFirst: true })
    assert.deepEqual([found.stage, found.origin], ['freeview', source])
  }
})

test('an owner-chosen copy is read without screening, even when the gate would call it a stand-in', async () => {
  const { checks } = await memoryChecks()
  const standIn = { body: await sceneOf(5), source: 'https://img.example.com/x/default_program_image.png' }
  const images = { 'guide-picture:aaaaaaaaaaaaaaaaaaaaaaaa-v1': standIn, 'upload:show/background/1': { body: await sevenCard('Mine') } }
  const gate = gateOver({ checks, images })
  assert.equal(await gate.load('guide-picture:aaaaaaaaaaaaaaaaaaaaaaaa-v1'), null)
  assert.equal((await gate.loadOwnerChoice('guide-picture:aaaaaaaaaaaaaaaaaaaaaaaa-v1')).body, standIn.body)
  assert.deepEqual(await gate.screen('upload:show/background/1'), { verdict: 'ok', reason: null })
  const thumbnails = { thumbnailFor: async ({ key }) => ({ body: Buffer.from(key) }) }
  const served = await gate.servedThumbnail({ origin: 'guide-picture:aaaaaaaaaaaaaaaaaaaaaaaa-v1', ownerChoice: true, thumbnails, key: 'chosen', width: 384 })
  assert.equal(served.body.toString(), 'chosen')
})

test('a cached thumbnail of a source later judged a stand-in is not served', async () => {
  const { checks } = await memoryChecks()
  const source = 'https://img.example.com/a/611157_91.png'
  const gate = gateOver({ checks, images: { [source]: { body: await sceneOf(6) } } })
  const cached = { thumbnailFor: async () => ({ body: Buffer.from('cached') }) }
  const serve = () => gate.servedThumbnail({ origin: source, thumbnails: cached, key: `show-1080:${source}`, width: 384 })
  assert.equal((await serve()).body.toString(), 'cached')
  checks.noteTitles(['Love Island Australia', 'The Garden Gurus', 'Budget Battlers', 'Helping Hands', 'Lingo'].map((title) => ({ source, title })))
  assert.equal(await gate.knownVerdict(source), 'stand-in')
  assert.equal(await serve(), null)
})

test('recording copies are screened at save and on read, by the guide address they came from and by their bytes', async () => {
  const { checks } = await memoryChecks()
  const named = 'https://img-store-prod.switch.tv/images/0027/814112_default_program_image.png'
  const images = {
    [named]: { body: await sceneOf(7) },
    'recording:d86a4bc0f607885abd1c30ae34174c68': { body: await sceneOf(7) },
    'recording:card': { body: await sevenCard('Seven News') },
    'recording:real': { body: await sceneOf(8) },
  }
  const gate = gateOver({ checks, images, recordingSources: { d86a4bc0f607885abd1c30ae34174c68: named } })
  assert.equal((await gate.screen(named)).verdict, 'stand-in')
  const save = await createArtResolver({
    stages: { own: async ({ ownSource }) => ({ sources: [ownSource] }), 'same-title': async () => ({ sources: ['recording:card'] }) },
    loadImage: gate.load,
    store: noStore,
    followUpDelaysMs: [],
  }).resolveRecordingPicture({ title: 'Big Brother', eventId: 'bb', ownSource: named })
  assert.deepEqual([save.stage, save.origin], ['weak', 'recording:card'])
  assert.equal(await gate.load('recording:d86a4bc0f607885abd1c30ae34174c68'), null)
  assert.equal((await gate.screen('recording:card')).verdict, 'weak')
  assert.equal((await gate.screen('recording:real')).verdict, 'ok')
  const found = await createArtResolver({
    stages: { episode: async () => ({ sources: ['recording:d86a4bc0f607885abd1c30ae34174c68'] }), frame: async () => ({ sources: ['recording:real'] }) },
    loadImage: gate.load,
    store: noStore,
    followUpDelaysMs: [],
  }).resolve({ title: 'Big Brother', recordingId: 'd86a4bc0f607885abd1c30ae34174c68' })
  assert.equal(found.origin, 'recording:real')
})

test('the gate rule version is part of the resolver fingerprint, so a rule change re-resolves once', async () => {
  const rows = new Map()
  const store = { read: async (key) => rows.get(key) ?? null, write: async (row) => rows.set(row.resolution_key, row), markDue: async () => [], stamped: async () => [] }
  const loads = []
  const resolverWith = (ruleVersion) => createArtResolver({
    stages: { guide: async () => ({ sources: ['https://img.example.com/p.jpg'] }) },
    loadImage: async (origin) => {
      loads.push(origin)
      return { body: await sceneOf(2) }
    },
    ruleVersion,
    store,
    followUpDelaysMs: [],
  })
  await resolverWith(GATE_RULE_VERSION).resolve({ title: 'Lingo' })
  await resolverWith(GATE_RULE_VERSION).resolve({ title: 'Lingo' })
  assert.equal(loads.length, 1)
  await resolverWith(`${GATE_RULE_VERSION}-next`).resolve({ title: 'Lingo' })
  assert.equal(loads.length, 2)
})

test('channel logo marks are kept in a setting, so a restart judges a title card weak before the guide pictures job runs', async () => {
  const database = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  cleanups.push(() => database.destroy())
  await upPictureChecks(database)
  await upPictureCheckMarks(database)
  await database.schema.createTable('settings', (t) => {
    t.string('key').primary()
    t.text('value')
  })
  const images = {
    'https://img.example.com/fetch/bridge-of-lies': { body: await sevenCard('Bridge of Lies') },
    'https://img.example.com/fetch/the-chase': { body: await sevenCard('The Chase') },
  }
  const before = createPlaceholderPictures({ database })
  await before.setLogos([await logoTraitsOf(sevenLogo)])
  assert.equal((await gateOver({ checks: before, images }).screen('https://img.example.com/fetch/bridge-of-lies')).verdict, 'weak')
  const restarted = gateOver({ checks: createPlaceholderPictures({ database }), images })
  assert.equal(await restarted.knownVerdict('https://img.example.com/fetch/bridge-of-lies'), 'weak')
  assert.equal((await restarted.screen('https://img.example.com/fetch/the-chase')).verdict, 'weak')
})

test('a picture that cannot be measured is stored once, judged ok or by name, and never twinned with other unmeasurable pictures', async () => {
  const database = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  cleanups.push(() => database.destroy())
  await upPictureChecks(database)
  await upPictureCheckMarks(database)
  let decodes = 0
  const checks = createPlaceholderPictures({ database, traitsOf: async () => { decodes += 1; return null } })
  const broken = { body: Buffer.from('not a picture') }
  const titles = (source, names) => names.map((title) => ({ source, title }))
  checks.noteTitles([
    ...titles('https://img.example.com/a/1.jpg', ['Alpha', 'Bravo', 'Charlie', 'Delta']),
    ...titles('https://img.example.com/b/2.jpg', ['Echo', 'Foxtrot', 'Golf', 'Hotel']),
  ])
  for (let at = 0; at < 3; at += 1) {
    assert.equal((await checks.judge({ source: 'https://img.example.com/a/1.jpg', image: broken })).verdict, 'ok')
    assert.equal((await checks.judge({ source: 'https://img.example.com/b/2.jpg', image: broken })).verdict, 'ok')
  }
  assert.equal(decodes, 2)
  assert.equal((await database('picture_checks').where({ source_url: 'https://img.example.com/a/1.jpg' }).first()).marks, '')
  assert.deepEqual(await checks.judge({ source: 'https://img.example.com/x/9go_logo.png', image: broken }), { verdict: 'stand-in', reason: 'name' })
  const reloaded = createPlaceholderPictures({ database, traitsOf: async () => { throw new Error('decoded again') } })
  assert.equal((await reloaded.judge({ source: 'https://img.example.com/a/1.jpg', image: broken })).verdict, 'ok')
  assert.equal(reloaded.isMeasured('https://img.example.com/a/1.jpg'), true)
})
