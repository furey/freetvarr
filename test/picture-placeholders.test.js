import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import knexFactory from 'knex'
import sharp from 'sharp'

import { up as upGuidePictures } from '../migrations/0046_guide_pictures.js'
import { up as upPictureChecks } from '../migrations/0049_picture_checks.js'
import { up as upPictureCheckMarks } from '../migrations/0051_picture_check_marks.js'
import { createArtResolver } from '../src/art-resolver.js'
import { createGuidePictures } from '../src/guide-pictures.js'
import {
  LOGO_MATCH_DISTANCE,
  createPlaceholderPictures,
  hashDistanceOf,
  pictureHashOf,
  pictureTraitsOf,
  placeholderReasonOf,
  titleFamilyOf,
} from '../src/picture-placeholders.js'

const SEVEN_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><polygon points="40,40 360,40 200,360 120,360 250,110 40,110" fill="#e11"/></svg>'
const sevenLogo = await sharp(Buffer.from(SEVEN_LOGO_SVG)).flatten({ background: '#000' }).png().toBuffer()
const logoOnCanvas = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#000' } })
  .composite([{ input: await sharp(sevenLogo).resize(700, 700).toBuffer(), gravity: 'center' }])
  .jpeg()
  .toBuffer()
const transparentLogo = await sharp(Buffer.from(SEVEN_LOGO_SVG)).resize(1600, 900, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()

const sceneOf = async (seed) => {
  const width = 64
  const height = 36
  const pixels = Buffer.alloc(width * height * 3)
  for (let at = 0; at < pixels.length; at += 1) pixels[at] = (Math.sin(at * 0.37 * seed) * 127 + 128) & 0xff
  return sharp(pixels, { raw: { width, height, channels: 3 } }).resize(1280, 720).jpeg().toBuffer()
}

const cleanups = []
after(() => Promise.all(cleanups.map((cleanup) => cleanup())))

const memoryDatabase = async () => {
  const database = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  await upGuidePictures(database)
  await upPictureChecks(database)
  await upPictureCheckMarks(database)
  cleanups.push(() => database.destroy())
  return database
}

test('pictureHashOf matches a channel logo against the same logo centred on a wide canvas', async () => {
  const [logo, placeholder, scene] = await Promise.all([pictureHashOf(sevenLogo), pictureHashOf(logoOnCanvas), pictureHashOf(await sceneOf(1))])
  assert.ok(hashDistanceOf(logo, placeholder) <= LOGO_MATCH_DISTANCE)
  assert.ok(hashDistanceOf(logo, scene) > LOGO_MATCH_DISTANCE)
  const traits = await pictureTraitsOf(logoOnCanvas)
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/a/p1.jpg', traits, logoHashes: [logo] }), 'logo')
  const sceneTraits = await pictureTraitsOf(await sceneOf(1))
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/a/p2.jpg', traits: sceneTraits, logoHashes: [logo] }), null)
})

test('placeholderReasonOf flags transparent logos, placeholder file names, and images shared by unrelated titles', async () => {
  const traits = await pictureTraitsOf(transparentLogo)
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/837799_3840_x_2160.png', traits }), 'transparent')
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/x/814112_default_program_image.png' }), 'name')
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/x/420318_9go_logo_16x9.png' }), 'name')
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/x/p1.jpg', families: 5 }), 'repeated')
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/x/p1.jpg', families: 4 }), null)
  assert.equal(titleFamilyOf('The Cheap Seats'), 'cheap')
  assert.equal(titleFamilyOf('Rage Charts'), titleFamilyOf('rage New Music'))
})

test('placeholderReasonOf keeps opaque key art shared by 3 title families unless it is near a channel logo', async () => {
  const traits = await pictureTraitsOf(await sceneOf(7))
  const farLogo = await pictureHashOf(sevenLogo)
  assert.ok(hashDistanceOf(farLogo, traits.hash) > 16)
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/afl/p9.jpg', traits, families: 3, logoHashes: [farLogo] }), null)
  const nearLogo = (BigInt(`0x${traits.hash}`) ^ 0x7fffn).toString(16).padStart(16, '0')
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/afl/p9.jpg', traits, families: 3, logoHashes: [nearLogo] }), 'repeated')
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/afl/p9.jpg', traits, families: 2, logoHashes: [nearLogo] }), null)
})

test('createPlaceholderPictures flags the same image bytes used by unrelated titles under different addresses, and remembers it', async () => {
  const database = await memoryDatabase()
  const nineLogo = { body: await sceneOf(2) }
  const show = { body: await sceneOf(3) }
  const placeholders = createPlaceholderPictures({ database })
  placeholders.noteTitles([
    { source: 'https://img.example.com/a/611157_91.png', title: 'Love Island Australia' },
    { source: 'https://img.example.com/a/611157_91.png', title: 'The Garden Gurus' },
    { source: 'https://img.example.com/a/611157_91.png', title: 'Budget Battlers' },
    { source: 'https://img.example.com/a/611157_91.png', title: 'Helping Hands' },
    { source: 'https://img.example.com/rage.jpg', title: 'rage Charts' },
    { source: 'https://img.example.com/rage.jpg', title: 'Rage New Music' },
    { source: 'https://img.example.com/rage.jpg', title: 'Rage Ausmusic Month Special' },
  ])
  assert.equal(await placeholders.check({ source: 'https://img.example.com/a/611157_91.png', image: nineLogo }), null)
  assert.equal(await placeholders.check({ source: 'https://img.example.com/b/611157_91.png', title: "Jamie Durie's Future House", image: nineLogo }), 'repeated')
  assert.equal(placeholders.isPlaceholder('https://img.example.com/a/611157_91.png'), true)
  assert.equal(await placeholders.check({ source: 'https://img.example.com/rage.jpg', image: show }), null)
  const reloaded = createPlaceholderPictures({ database, traitsOf: async () => { throw new Error('computed twice') } })
  assert.equal(await reloaded.check({ source: 'https://img.example.com/b/611157_91.png', image: nineLogo }), 'repeated')
  assert.deepEqual([...await reloaded.placeholderSources()].sort(), ['https://img.example.com/a/611157_91.png', 'https://img.example.com/b/611157_91.png'])
})

test('the resolver chain skips a placeholder and moves on to the next picture', async () => {
  const database = await memoryDatabase()
  const placeholders = createPlaceholderPictures({ database })
  placeholders.setLogos([{ hash: await pictureHashOf(sevenLogo) }])
  const images = {
    'https://img.example.com/freeview/home-and-away-show.png': { body: logoOnCanvas },
    'https://img.example.com/own/home-and-away.jpg': { body: await sceneOf(4) },
  }
  const resolver = createArtResolver({
    stages: {
      freeview: async () => ({ sources: ['https://img.example.com/freeview/home-and-away-show.png'] }),
      own: async ({ ownSource }) => ({ sources: [ownSource] }),
    },
    loadImage: async (origin) => {
      const image = images[origin] ?? null
      return image && await placeholders.check({ source: origin, image }) ? null : image
    },
    store: { read: async () => null, write: async () => {}, markDue: async () => [], stamped: async () => [] },
    followUpDelaysMs: [],
  })
  const found = await resolver.resolve({ title: 'Home and Away', eventId: '7', ownSource: 'https://img.example.com/own/home-and-away.jpg', freeviewFirst: true })
  assert.equal(found.origin, 'https://img.example.com/own/home-and-away.jpg')
  assert.equal(found.stage, 'own')
})

test('guide pictures never saves a placeholder copy, drops saved copies that later prove to be placeholders, and keeps chosen and recorded copies', async () => {
  const database = await memoryDatabase()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-placeholders-'))
  cleanups.push(() => fs.rm(root, { recursive: true, force: true }))
  const shared = await sceneOf(5)
  const answers = {
    'https://img.example.com/10-plus-1.png': transparentLogo,
    'https://img.example.com/bb/9.png': shared,
    'https://img.example.com/lingo/9.png': shared,
    'https://img.example.com/news/9.png': shared,
    'https://img.example.com/home-and-away.jpg': await sceneOf(6),
    'https://img.example.com/home-and-away-7.jpg': logoOnCanvas,
  }
  const placeholders = createPlaceholderPictures({ database })
  const pictures = createGuidePictures({
    database,
    root,
    fetchImage: async (source) => ({ body: answers[source], contentType: 'image/png' }),
    sleep: async () => {},
    hostTally: null,
    screen: (picture) => placeholders.judge(picture),
  })
  const entry = (title, titleKey, sources) => [titleKey, { title, titleKey, sources }]
  await pictures.saveAll({ candidates: new Map([
    entry('Big Brother', 'big brother', ['https://img.example.com/10-plus-1.png', 'https://img.example.com/bb/9.png']),
    entry('Lingo', 'lingo', ['https://img.example.com/lingo/9.png']),
    entry('Home and Away', 'home and away', ['https://img.example.com/home-and-away.jpg', 'https://img.example.com/home-and-away-7.jpg']),
  ]) })
  const savedSources = async () => (await database('guide_pictures').pluck('source_url')).sort()
  assert.deepEqual(await savedSources(), [
    'https://img.example.com/bb/9.png',
    'https://img.example.com/home-and-away-7.jpg',
    'https://img.example.com/home-and-away.jpg',
    'https://img.example.com/lingo/9.png',
  ])
  placeholders.setLogos([{ hash: await pictureHashOf(sevenLogo) }])
  placeholders.noteTitles(['Millionaire Hot Seat', 'The Graham Norton Show', 'Deal Or No Deal'].map((title) => ({ source: 'https://img.example.com/news/9.png', title })))
  await pictures.saveAll({ candidates: new Map([entry('10 News', '10 news', ['https://img.example.com/news/9.png'])]) })
  const keeps = { keepTitleKeys: new Set(['big brother', 'home and away']), keepOrigins: new Set(['https://img.example.com/lingo/9.png']) }
  assert.deepEqual(await pictures.dropPlaceholders(keeps), ['home and away'])
  assert.deepEqual(await savedSources(), ['https://img.example.com/bb/9.png', 'https://img.example.com/home-and-away.jpg', 'https://img.example.com/lingo/9.png'])
  assert.deepEqual((await pictures.dropPlaceholders()).sort(), ['big brother', 'lingo'])
  assert.deepEqual(await savedSources(), ['https://img.example.com/home-and-away.jpg'])
  assert.equal(await pictures.originFor('Big Brother'), null)
  assert.equal((await fs.readdir(root)).length, 1)
})

test('a saved stand-in copy is never offered, even before the guide pictures job checked it and when a recorded title keeps it', async () => {
  const database = await memoryDatabase()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-placeholders-'))
  cleanups.push(() => fs.rm(root, { recursive: true, force: true }))
  const answers = {
    'https://img-store-prod.switch.tv/bb/p34381102.jpg': await sceneOf(8),
    'https://img-store-prod.switch.tv/bb/837799_3840_x_2160.png': transparentLogo,
    'https://img-store-prod.switch.tv/kids/755218.png': transparentLogo,
  }
  const options = {
    database,
    root,
    fetchImage: async (source) => ({ body: answers[source], contentType: 'image/png' }),
    sleep: async () => {},
    hostTally: null,
    preferredHosts: ['img-store-prod.switch.tv'],
  }
  const clock = { ms: 1000 }
  const before = createGuidePictures({ ...options, now: () => clock.ms++ })
  await before.saveAll({ candidates: new Map([['big brother', { title: 'Big Brother', titleKey: 'big brother', sources: Object.keys(answers).slice(0, 2) }]]) })
  await before.saveAll({ candidates: new Map([['the loud house', { title: 'The Loud House', titleKey: 'the loud house', sources: [Object.keys(answers)[2]] }]]) })
  assert.match(await before.originFor('Big Brother'), /^guide-picture:/)
  const placeholders = createPlaceholderPictures({ database })
  const pictures = createGuidePictures({ ...options, screen: (picture) => placeholders.judge(picture) })
  const realCopy = await pictures.originForSource('https://img-store-prod.switch.tv/bb/p34381102.jpg')
  assert.equal(await pictures.dropPlaceholders({ keepTitleKeys: new Set(['big brother']) }).then((titles) => titles.includes('big brother')), false)
  assert.deepEqual(await pictures.titleOriginsFor('Big Brother'), [realCopy])
  assert.equal(await pictures.originFor('Big Brother'), realCopy)
  assert.equal(await pictures.preferredOriginFor('Big Brother'), realCopy)
  assert.equal(await pictures.originForSource('https://img-store-prod.switch.tv/bb/837799_3840_x_2160.png'), null)
  assert.equal(await database('picture_checks').where({ source_url: 'https://img-store-prod.switch.tv/bb/837799_3840_x_2160.png' }).first().then(Boolean), true)
  assert.deepEqual([...await pictures.savedTitleKeys()], ['big brother'])
})

test('serving a saved copy checks it on first sight, with no guide pictures job run', async () => {
  const database = await memoryDatabase()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-placeholders-'))
  cleanups.push(() => fs.rm(root, { recursive: true, force: true }))
  const source = 'https://img-store-prod.switch.tv/jd/611157_91.png'
  const unscreened = createGuidePictures({ database, root, fetchImage: async () => ({ body: transparentLogo }), sleep: async () => {}, hostTally: null })
  await unscreened.saveAll({ candidates: new Map([['jamie', { title: 'Jamie', titleKey: 'jamie', sources: [source] }]]) })
  const placeholders = createPlaceholderPictures({ database })
  const pictures = createGuidePictures({ database, root, fetchImage: async () => null, sleep: async () => {}, hostTally: null, screen: (picture) => placeholders.judge(picture) })
  const origin = await unscreened.originFor('Jamie')
  assert.equal(await pictures.sourceOfOrigin(origin), source)
  assert.equal(await pictures.originFor('Jamie'), null)
  assert.equal(placeholders.isPlaceholder(source), true)
})
