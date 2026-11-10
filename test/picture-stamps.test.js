import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-picture-stamps-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { forgetPlaceholderPictures, resolvedArtStamps } = await import('../src/epg.js')
const { createArtFeed } = await import('../src/art-feed.js')
const { createProgrammeStamps } = await import('../src/programme-stamps.js')
const { pruneLookupCaches } = await import('../src/cache-prune.js')
const { createArtworkStamps, unstampedUrl } = await import('../src/web/artwork-stamps.js')

const STAND_IN = 'https://img.example.com/7-logo.png'
const REAL = 'https://img.example.com/home-and-away.jpg'
const AIRING_STAND_IN = 'https://img.example.com/9-logo.png'
const NOW = Date.now()

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db('art_resolutions').delete()
  await db('programme_picture_stamps').delete()
  await db('settings').where({ key: 'stand_in_airing_sources' }).delete()
})

const resolution = ({ key, titleKey, showKey, origin, nextCheckAt = NOW + 1e9, stamp = null }) => ({
  resolution_key: key, title_key: titleKey, show_key: showKey, kind: 'series', shape: 'landscape', stage: 'guide',
  origin, transform: 'none', fingerprint: 'f', resolved_at: NOW, next_check_at: nextCheckAt, stamp,
})

const fakePictures = (dropped) => ({
  dropPlaceholders: async () => dropped.splice(0),
  sourceOfOrigin: async (origin) => origin,
})

const fakePlaceholders = { saveFamilies: async () => 0, isPlaceholder: (source) => /logo/.test(String(source)) }

test('a dropped stand-in keeps its row, is marked due with a new stamp, and tells open pages the new title and programme stamps', async () => {
  await db('art_resolutions').insert([
    resolution({ key: 'series|landscape|home and away', titleKey: 'home and away', showKey: 'home-and-away', origin: STAND_IN }),
    resolution({ key: 'series|landscape|bluey', titleKey: 'bluey', showKey: 'bluey', origin: REAL, stamp: 'kept' }),
    resolution({ key: 'series|landscape|lingo', titleKey: 'lingo', showKey: 'lingo', origin: STAND_IN, nextCheckAt: 0, stamp: 'due0' }),
  ])
  const feed = createArtFeed()
  const cursor = feed.cursor()
  const pictures = fakePictures(['gruen'])
  const airings = async () => [{ image: AIRING_STAND_IN, title: 'The Chase' }, { image: REAL, title: 'Home and Away' }]
  const announced = await forgetPlaceholderPictures({ database: db, pictures, placeholders: fakePlaceholders, airings, feed })
  assert.equal(announced, 3)
  const rows = new Map((await db('art_resolutions').select()).map((row) => [row.title_key, row]))
  assert.equal(rows.size, 3)
  const marked = rows.get('home and away')
  assert.deepEqual([marked.origin, Number(marked.next_check_at)], [STAND_IN, 0])
  assert.ok(marked.stamp)
  assert.deepEqual([rows.get('bluey').stamp, rows.get('lingo').stamp], ['kept', 'due0'])
  const programme = await createProgrammeStamps({ database: db }).stampsByKey()
  assert.deepEqual([...programme.keys()].sort(), ['gruen', 'home-and-away', 'the-chase'])
  const sent = feed.since(cursor).stamps.map(({ key, kind, stamp }) => `${kind}|${key}|${stamp}`).sort()
  assert.deepEqual(sent, [
    'background|gruen|null',
    `background|home-and-away|${marked.stamp}`,
    'background|the-chase|null',
    'poster|gruen|null',
    'poster|the-chase|null',
    `programme|gruen|${programme.get('gruen')}`,
    `programme|home-and-away|${programme.get('home-and-away')}`,
    `programme|the-chase|${programme.get('the-chase')}`,
  ])
  assert.equal(await forgetPlaceholderPictures({ database: db, pictures, placeholders: fakePlaceholders, airings, feed }), 0)
})

test('a restart with the same stand-in airing addresses bumps no programme stamp; a new stand-in address bumps its titles', async () => {
  await db('settings').insert({ key: 'stand_in_airing_sources', value: JSON.stringify([AIRING_STAND_IN]) })
  const feed = createArtFeed()
  const run = (airings) => forgetPlaceholderPictures({ database: db, pictures: fakePictures([]), placeholders: fakePlaceholders, airings: async () => airings, feed })
  assert.equal(await run([{ image: AIRING_STAND_IN, title: 'The Chase' }]), 0)
  assert.deepEqual([...(await createProgrammeStamps({ database: db }).stampsByKey()).keys()], [])
  assert.equal(await run([{ image: AIRING_STAND_IN, title: 'The Chase' }, { image: 'https://img.example.com/10-logo.png', title: 'Gogglebox' }]), 1)
  assert.deepEqual([...(await createProgrammeStamps({ database: db }).stampsByKey()).keys()], ['gogglebox'])
})

test('the stamps endpoint lists programme stamps beside title stamps, and the client puts them on airing and recording URLs', async () => {
  await db('art_resolutions').insert(resolution({ key: 'series|landscape|gruen', titleKey: 'gruen', showKey: 'gruen', origin: REAL, stamp: 't1' }))
  const bumped = await createProgrammeStamps({ database: db }).bump(['gruen'])
  const stamps = Object.fromEntries(await resolvedArtStamps())
  assert.deepEqual(stamps.gruen, { background: 't1', programme: bumped.get('gruen') })
  const client = createArtworkStamps({ storage: null })
  client.replaceAll(stamps)
  assert.equal(client.stampUrl('/api/epg/image/42?w=192', 'Gruen'), `/api/epg/image/42?w=192&c=${bumped.get('gruen')}`)
  assert.equal(client.stampUrl('/api/recordings/r1/image?w=384', 'Gruen'), `/api/recordings/r1/image?w=384&c=${bumped.get('gruen')}`)
  assert.equal(client.stampUrl('/api/epg/image/42?w=192', 'Bluey'), '/api/epg/image/42?w=192')
  assert.equal(client.stampUrl('/api/epg/image/42?w=192'), '/api/epg/image/42?w=192')
  client.setStamps([{ key: 'gruen', kind: 'programme', stamp: 'p2' }])
  assert.equal(client.stampUrl('/api/epg/image/42?w=192&c=old', 'Gruen'), '/api/epg/image/42?w=192&c=p2')
  assert.equal(unstampedUrl('/api/epg/image/42?w=192'), '/api/epg/image/42?w=192')
})

test('a programme stamp changes on every bump', async () => {
  const stamps = createProgrammeStamps({ database: db })
  const first = (await stamps.bump(['gruen', 'gruen', null])).get('gruen')
  const second = (await stamps.bump(['gruen'])).get('gruen')
  assert.notEqual(first, second)
  assert.deepEqual([...(await stamps.stampsByKey())], [['gruen', second]])
})

test('the daily prune keeps a resolution marked due and drops one not resolved for 90 days', async () => {
  await db('art_resolutions').insert([
    resolution({ key: 'series|landscape|due', titleKey: 'due', showKey: 'due', origin: STAND_IN, nextCheckAt: 0, stamp: 'd1' }),
    { ...resolution({ key: 'series|landscape|old', titleKey: 'old', showKey: 'old', origin: REAL }), resolved_at: NOW - 100 * 24 * 60 * 60 * 1000 },
  ])
  await pruneLookupCaches({ database: db, nowMs: NOW })
  assert.deepEqual((await db('art_resolutions').select('resolution_key')).map((row) => row.resolution_key), ['series|landscape|due'])
})
