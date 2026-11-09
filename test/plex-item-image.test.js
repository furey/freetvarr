import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createImageCache, createItemImage } from '../src/plex-library-routes.js'
import { itemArtOf } from '../src/plex-library.js'

const OLD_THUMB = '/library/metadata/77/thumb/1700000000'
const NEW_THUMB = '/library/metadata/77/thumb/1731000000'

const itemImageWith = ({ row, metadata, clock = { ms: 0 } }) => {
  const saved = []
  const published = []
  const fetched = []
  const metadataCalls = []
  const itemImage = createItemImage({
    loadRow: async () => row,
    fetchImage: async ({ source, width }) => {
      fetched.push(source)
      return source === NEW_THUMB ? { body: Buffer.from(`image|${width}`), contentType: 'image/jpeg' } : null
    },
    fetchMetadata: async (ratingKey) => {
      metadataCalls.push(ratingKey)
      return metadata
    },
    saveArt: async (ratingKey, art) => saved.push({ ratingKey, art }),
    publish: (change) => published.push(change),
    cache: createImageCache({ now: () => clock.ms }),
    now: () => clock.ms,
  })
  return { itemImage, saved, published, fetched, metadataCalls, clock }
}

test('itemArtOf: the same thumb and art rules as the library scan', () => {
  assert.deepEqual(itemArtOf({ thumb: '/t', art: '/a' }), { thumb: '/t', art: '/a' })
  assert.deepEqual(itemArtOf({ grandparentThumb: '/gt', grandparentArt: '/ga', art: '/a' }), { thumb: '/gt', art: '/ga' })
  assert.deepEqual(itemArtOf({}), { thumb: null, art: null })
})

test('a stale Plex thumb reads the item again, saves the new thumb, serves it, and tells open pages', async () => {
  const row = { rating_key: '77', title: 'Pilot', show_title: 'Fargo', thumb: OLD_THUMB, art: '/art/1' }
  const { itemImage, saved, published, fetched, metadataCalls } = itemImageWith({ row, metadata: { thumb: NEW_THUMB, grandparentArt: '/art/1' } })
  const image = await itemImage({ ratingKey: '77', kind: 'thumb', width: 384 })
  assert.equal(image.body.toString(), 'image|384')
  assert.deepEqual(fetched, [OLD_THUMB, NEW_THUMB])
  assert.deepEqual(metadataCalls, ['77'])
  assert.deepEqual(saved, [{ ratingKey: '77', art: { thumb: NEW_THUMB, art: '/art/1' } }])
  assert.deepEqual(published, [
    { key: 'fargo', kind: 'poster', stamp: null },
    { key: 'fargo', kind: 'background', stamp: null },
  ])
})

test('a real Plex miss asks Plex once per 5 min and saves nothing', async () => {
  const row = { rating_key: '77', title: 'Dune', thumb: OLD_THUMB, art: null }
  const { itemImage, saved, published, metadataCalls, clock } = itemImageWith({ row, metadata: { thumb: OLD_THUMB } })
  assert.equal(await itemImage({ ratingKey: '77', kind: 'thumb', width: 384 }), null)
  assert.equal(await itemImage({ ratingKey: '77', kind: 'thumb', width: 384 }), null)
  assert.deepEqual(metadataCalls, ['77'])
  clock.ms = 5 * 60 * 1000 + 1
  await itemImage({ ratingKey: '77', kind: 'thumb', width: 384 })
  assert.deepEqual(metadataCalls, ['77', '77'])
  assert.deepEqual(saved, [])
  assert.deepEqual(published, [])
})

test('a working thumb never asks Plex for the item', async () => {
  const row = { rating_key: '77', title: 'Dune', thumb: NEW_THUMB, art: null }
  const { itemImage, metadataCalls } = itemImageWith({ row, metadata: null })
  assert.ok(await itemImage({ ratingKey: '77', kind: 'thumb', width: 384 }))
  assert.deepEqual(metadataCalls, [])
})
