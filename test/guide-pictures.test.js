import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import knexFactory from 'knex'
import sharp from 'sharp'

import { up } from '../migrations/0046_guide_pictures.js'
import {
  GUIDE_PICTURE_MAX_WIDTH,
  createGuidePictures,
  guidePictureCandidatesOf,
  guidePictureIdOf,
  isGuidePictureOrigin,
} from '../src/guide-pictures.js'
import { createHostTally } from '../src/programme-images.js'

const DAY = 24 * 60 * 60 * 1000
const WIDE_JPEG = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: { r: 40, g: 90, b: 140 } } }).jpeg().toBuffer()

const cleanups = []

after(() => Promise.all(cleanups.map((cleanup) => cleanup())))

const setUp = async ({ answers = {}, clock = { ms: 1000 * DAY }, ...options } = {}) => {
  const database = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  await up(database)
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-guide-pictures-'))
  const fetched = []
  const waits = []
  const hostTally = createHostTally({ now: () => clock.ms })
  const pictures = createGuidePictures({
    database,
    root,
    hostTally,
    now: () => clock.ms,
    sleep: async (ms) => { waits.push(ms) },
    fetchImage: async (source) => {
      fetched.push(source)
      const answer = answers[source]
      if (answer instanceof Error) throw answer
      return answer === undefined ? { body: WIDE_JPEG, contentType: 'image/jpeg' } : answer
    },
    ...options,
  })
  cleanups.push(async () => {
    await database.destroy()
    await fs.rm(root, { recursive: true, force: true })
  })
  return { database, root, pictures, fetched, waits, clock, hostTally }
}

const airing = (title, image, start) => ({ title, image, start })

test('guidePictureCandidatesOf groups airings by title key, earliest image first, without repeats', () => {
  const candidates = guidePictureCandidatesOf([
    airing('The Chase', 'https://images.example.com/chase-2.jpg', 300),
    airing('the chase', 'https://images.example.com/chase-1.jpg', 100),
    airing('The Chase', 'https://images.example.com/chase-1.jpg', 200),
    airing('News', null, 100),
  ])
  assert.deepEqual(candidates.get('chase').sources, ['https://images.example.com/chase-1.jpg', 'https://images.example.com/chase-2.jpg'])
  assert.deepEqual(candidates.get('news').sources, [])
})

test('saveAll saves one WebP per title, at most 1280 px wide, and the saved origin reads it back', async () => {
  const { database, root, pictures, fetched } = await setUp()
  const result = await pictures.saveAll({ candidates: guidePictureCandidatesOf([
    airing('Bluey', 'https://images.example.com/bluey.jpg', 1),
    airing('Bluey', 'https://images.example.com/bluey.jpg', 2),
  ]) })
  assert.equal(result.saved, 1)
  assert.deepEqual(fetched, ['https://images.example.com/bluey.jpg'])
  const row = await database('guide_pictures').first()
  assert.equal(row.title_key, 'bluey')
  assert.equal(row.host, 'images.example.com')
  assert.equal(row.w, GUIDE_PICTURE_MAX_WIDTH)
  assert.equal(row.h, 720)
  const file = await fs.readFile(path.join(root, `${guidePictureIdOf('https://images.example.com/bluey.jpg')}.webp`))
  assert.equal(row.bytes, file.length)
  assert.equal((await sharp(file).metadata()).format, 'webp')
  const origin = await pictures.originFor('Bluey')
  assert.ok(isGuidePictureOrigin(origin))
  assert.deepEqual(await pictures.read(origin), { body: file, contentType: 'image/webp' })
  assert.equal(await pictures.originFor('Unknown Show'), null)
  assert.equal(await pictures.originForSource('https://images.example.com/bluey.jpg'), origin)
})

test('saveAll saves each address of a title once, and the newest saved address is the title copy', async () => {
  const { database, pictures, fetched, clock } = await setUp()
  const first = guidePictureCandidatesOf([airing('Gruen', 'https://images.example.com/gruen-1.jpg', 1)])
  await pictures.saveAll({ candidates: first })
  const before = await pictures.originFor('Gruen')
  clock.ms += DAY
  const again = await pictures.saveAll({ candidates: first })
  assert.deepEqual([again.saved, again.kept], [0, 1])
  assert.equal(fetched.length, 1)
  assert.equal(Number((await database('guide_pictures').first()).last_seen_at), clock.ms)
  await pictures.saveAll({ candidates: guidePictureCandidatesOf([airing('Gruen', 'https://images.example.com/gruen-2.jpg', 1)]) })
  assert.deepEqual(fetched, ['https://images.example.com/gruen-1.jpg', 'https://images.example.com/gruen-2.jpg'])
  assert.deepEqual(await database('guide_pictures').orderBy('source_url').pluck('source_url'), ['https://images.example.com/gruen-1.jpg', 'https://images.example.com/gruen-2.jpg'])
  assert.notEqual(await pictures.originFor('Gruen'), before)
  assert.equal(await pictures.originForSource('https://images.example.com/gruen-1.jpg'), before)
  assert.equal(await pictures.originFor('Gruen'), await pictures.originForSource('https://images.example.com/gruen-2.jpg'))
})

test('a failing address keeps the saved copy, is not asked again for a day, and is counted against its host', async () => {
  const blocked = 'https://images.example.com/hard-quiz-new.jpg'
  const { pictures, fetched, clock, hostTally } = await setUp({ answers: { [blocked]: null } })
  await pictures.saveAll({ candidates: guidePictureCandidatesOf([airing('Hard Quiz', 'https://images.example.com/hard-quiz.jpg', 1)]) })
  const saved = await pictures.originFor('Hard Quiz')
  const changed = guidePictureCandidatesOf([airing('Hard Quiz', blocked, 1)])
  const result = await pictures.saveAll({ candidates: changed })
  assert.deepEqual([result.saved, result.failed, result.unsaved], [0, ['hard quiz'], []])
  assert.equal(await pictures.originFor('Hard Quiz'), saved)
  await pictures.saveAll({ candidates: changed })
  assert.equal(fetched.filter((source) => source === blocked).length, 1)
  clock.ms += DAY + 1
  await pictures.saveAll({ candidates: changed })
  assert.equal(fetched.filter((source) => source === blocked).length, 2)
  assert.deepEqual(hostTally.stats().get('images.example.com'), { tried: 3, failed: 2, loaded: 1, lastAt: clock.ms })
})

test('a title with no saved copy whose addresses all fail is reported as unsaved, as is a title with no address', async () => {
  const { pictures } = await setUp({ answers: { 'https://images.example.com/a.jpg': new Error('HTTP 503') } })
  const result = await pictures.saveAll({ candidates: guidePictureCandidatesOf([
    airing('Title A', 'https://images.example.com/a.jpg', 1),
    airing('Title B', null, 2),
  ]) })
  assert.deepEqual(result.unsaved.sort(), ['title a', 'title b'])
})

test('saveAll fetches one picture at a time with a gap between requests to one host', async () => {
  const { pictures, waits } = await setUp({ gapMs: 1000 })
  await pictures.saveAll({ candidates: guidePictureCandidatesOf([
    airing('One', 'https://images.example.com/1.jpg', 1),
    airing('Two', 'https://images.example.com/2.jpg', 2),
    airing('Three', 'https://other.example.net/3.jpg', 3),
  ]) })
  assert.equal(waits.filter((ms) => ms > 0).length, 1)
  assert.ok(waits.some((ms) => ms > 900 && ms <= 1000))
})

test('prune deletes copies unseen for 180 days unless a recording, library item, or choice uses them', async () => {
  const { database, root, pictures, clock } = await setUp()
  await pictures.saveAll({ candidates: guidePictureCandidatesOf([
    airing('Old Show', 'https://images.example.com/old.jpg', 1),
    airing('Recorded Show', 'https://images.example.com/recorded.jpg', 2),
    airing('Chosen Show', 'https://images.example.com/chosen.jpg', 3),
  ]) })
  const chosen = await pictures.originFor('Chosen Show')
  clock.ms += 120 * DAY
  await pictures.saveAll({ candidates: guidePictureCandidatesOf([airing('Fresh Show', 'https://images.example.com/fresh.jpg', 1)]) })
  clock.ms += 70 * DAY
  const removed = await pictures.prune({ keepTitleKeys: new Set(['recorded show']), keepOrigins: new Set([chosen]) })
  assert.equal(removed, 1)
  assert.deepEqual((await database('guide_pictures').orderBy('title_key').pluck('title_key')), ['chosen show', 'fresh show', 'recorded show'])
  assert.equal(await pictures.originFor('Old Show'), null)
  await assert.rejects(fs.access(path.join(root, `${guidePictureIdOf('https://images.example.com/old.jpg')}.webp`)))
})

test('prune keeps the copies under the size cap by deleting the oldest seen first', async () => {
  const { database, root, pictures, clock } = await setUp()
  for (const [index, title] of ['First', 'Second', 'Third'].entries()) {
    clock.ms += DAY
    await pictures.saveAll({ candidates: guidePictureCandidatesOf([airing(title, `https://images.example.com/${index}.jpg`, 1)]) })
  }
  const sizes = await database('guide_pictures').orderBy('last_seen_at').pluck('bytes')
  const cap = sizes[1] + sizes[2]
  const capped = createGuidePictures({ database, root, now: () => clock.ms, maxBytes: cap, fetchImage: async () => null })
  assert.equal(await capped.prune(), 1)
  assert.deepEqual(await database('guide_pictures').orderBy('title_key').pluck('title_key'), ['second', 'third'])
})

test('an airing keeps its own saved picture while another airing of the title has a different saved copy', async () => {
  const { pictures } = await setUp()
  await pictures.saveAll({ candidates: guidePictureCandidatesOf([
    airing('Gardening Australia', 'https://images.example.com/ga-1.jpg', 1),
    airing('Gardening Australia', 'https://images.example.com/ga-2.jpg', 2),
  ]) })
  const first = await pictures.originForSource('https://images.example.com/ga-1.jpg')
  const second = await pictures.originForSource('https://images.example.com/ga-2.jpg')
  assert.ok(first && second && first !== second)
  assert.equal(await pictures.originFor('Gardening Australia'), second)
  assert.notDeepEqual((await pictures.read(first)).body.length, 0)
})
