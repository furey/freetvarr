import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import knexFactory from 'knex'
import sharp from 'sharp'

import { up as upGuidePictures } from '../migrations/0046_guide_pictures.js'
import { up as upPictureChecks } from '../migrations/0049_picture_checks.js'
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
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/x/p1.jpg', families: 3 }), 'repeated')
  assert.equal(placeholderReasonOf({ source: 'https://img.example.com/x/p1.jpg', families: 2 }), null)
  assert.equal(titleFamilyOf('The Cheap Seats'), 'cheap')
  assert.equal(titleFamilyOf('Rage Charts'), titleFamilyOf('rage New Music'))
})

test('createPlaceholderPictures flags the same image bytes used by unrelated titles under different addresses, and remembers it', async () => {
  const database = await memoryDatabase()
  const nineLogo = { body: await sceneOf(2) }
  const show = { body: await sceneOf(3) }
  const placeholders = createPlaceholderPictures({ database })
  placeholders.noteTitles([
    { source: 'https://img.example.com/a/611157_91.png', title: 'Love Island Australia' },
    { source: 'https://img.example.com/a/611157_91.png', title: 'The Garden Gurus' },
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
  placeholders.setLogoHashes([await pictureHashOf(sevenLogo)])
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
    store: { read: async () => null, write: async () => {}, remove: async () => {}, removeTitle: async () => {}, stamped: async () => [] },
    followUpDelaysMs: [],
  })
  const found = await resolver.resolve({ title: 'Home and Away', eventId: '7', ownSource: 'https://img.example.com/own/home-and-away.jpg', freeviewFirst: true })
  assert.equal(found.origin, 'https://img.example.com/own/home-and-away.jpg')
  assert.equal(found.stage, 'own')
})

test('guide pictures never saves a placeholder copy and drops saved copies that later prove to be placeholders', async () => {
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
  }
  const placeholders = createPlaceholderPictures({ database })
  const pictures = createGuidePictures({
    database,
    root,
    fetchImage: async (source) => ({ body: answers[source], contentType: 'image/png' }),
    sleep: async () => {},
    hostTally: null,
    screen: (picture) => placeholders.check(picture),
  })
  const entry = (title, titleKey, sources) => [titleKey, { title, titleKey, sources }]
  await pictures.saveAll({ candidates: new Map([
    entry('Big Brother', 'big brother', ['https://img.example.com/10-plus-1.png', 'https://img.example.com/bb/9.png']),
    entry('Lingo', 'lingo', ['https://img.example.com/lingo/9.png']),
    entry('Home and Away', 'home and away', ['https://img.example.com/home-and-away.jpg']),
  ]) })
  const savedSources = async () => (await database('guide_pictures').pluck('source_url')).sort()
  assert.deepEqual(await savedSources(), ['https://img.example.com/bb/9.png', 'https://img.example.com/home-and-away.jpg', 'https://img.example.com/lingo/9.png'])
  await pictures.saveAll({ candidates: new Map([entry('10 News', '10 news', ['https://img.example.com/news/9.png'])]) })
  assert.deepEqual((await pictures.dropPlaceholders()).sort(), ['big brother', 'lingo'])
  assert.deepEqual(await savedSources(), ['https://img.example.com/home-and-away.jpg'])
  assert.equal(await pictures.originFor('Big Brother'), null)
  assert.equal((await fs.readdir(root)).length, 1)
})
