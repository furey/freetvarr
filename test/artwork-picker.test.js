import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PICTURE_KINDS, artworkPathOf, candidatesPathOf, emptyPicturesText, isPictureFile, isTooBigToUpload, pictureChangedText,
  pictureGroupsOf, pictureResetText, tmdbNoteOf, uploadPathOf, uploadRemovePathOf, uploadedPicturesOf, withUploadedOf,
  withoutUploadOf,
} from '../src/web/artwork-picker.js'

const picture = (id, kind, source) => ({ id, kind, source, url: `/x/${id}` })

test('pictureGroupsOf groups one kind by source in a fixed order and drops empty sources', () => {
  const candidates = [
    picture('g', 'background', 'guide'),
    picture('t', 'background', 'tvmaze'),
    picture('p', 'background', 'plex'),
    picture('q', 'poster', 'plex'),
  ]
  const groups = pictureGroupsOf({ candidates, kind: 'background' })
  assert.deepEqual(groups.map((group) => group.label), ['Plex', 'TVmaze', 'TV guide'])
  assert.deepEqual(groups[0].pictures.map((p) => p.id), ['p'])
  assert.deepEqual(pictureGroupsOf({ candidates, kind: 'poster' }).map((group) => group.source), ['plex'])
  assert.deepEqual(pictureGroupsOf({ kind: 'poster' }), [])
})

test('picker copy names the kind in sentence case', () => {
  assert.equal(pictureChangedText('background'), 'Background changed')
  assert.equal(pictureChangedText('poster'), 'Poster changed')
  assert.equal(pictureResetText('poster'), 'Poster set to automatic')
  assert.equal(tmdbNoteOf({ kind: 'poster', tmdbKey: false }), 'Add a TMDB key in Settings to see posters from TMDB.')
  assert.equal(tmdbNoteOf({ kind: 'background', tmdbKey: true }), '')
  assert.equal(emptyPicturesText('background'), 'No backgrounds found.')
  assert.equal(emptyPicturesText('poster'), 'No posters found.')
  assert.deepEqual(PICTURE_KINDS.map((option) => option.label), ['Background', 'Poster'])
})

test('picker paths encode the show key and kind', () => {
  assert.equal(artworkPathOf({ key: 'the-block', kind: 'poster' }), '/api/library/shows/the-block/artwork/poster')
  assert.equal(candidatesPathOf('a b'), '/api/library/shows/a%20b/artwork-candidates')
})

test('uploads sit in their own group and stay out of the found groups', () => {
  const candidates = [picture('u', 'background', 'upload'), picture('p', 'background', 'plex'), picture('v', 'poster', 'upload')]
  assert.deepEqual(uploadedPicturesOf({ candidates, kind: 'background' }).map((p) => p.id), ['u'])
  assert.deepEqual(pictureGroupsOf({ candidates, kind: 'background' }).map((group) => group.source), ['plex'])
})

test('withUploadedOf puts a new upload first and picks it; withoutUploadOf drops it', () => {
  const offer = { chosen: { background: 'p', poster: null }, candidates: [picture('p', 'background', 'plex')] }
  const added = withUploadedOf({ offer, candidate: picture('u', 'background', 'upload'), chosen: 'u' })
  assert.deepEqual(added.candidates.map((p) => p.id), ['u', 'p'])
  assert.deepEqual(added.chosen, { background: 'u', poster: null })
  const removed = withoutUploadOf({ offer: added, id: 'u', kind: 'background', chosen: null })
  assert.deepEqual(removed.candidates.map((p) => p.id), ['p'])
  assert.equal(removed.chosen.background, null)
})

test('upload checks catch big and non-picture files before sending', () => {
  assert.equal(isTooBigToUpload({ size: 20 * 1024 * 1024 }), false)
  assert.equal(isTooBigToUpload({ size: 20 * 1024 * 1024 + 1 }), true)
  assert.equal(isPictureFile({ type: 'image/jpeg' }), true)
  assert.equal(isPictureFile({ type: '' }), true)
  assert.equal(isPictureFile({ type: 'application/pdf' }), false)
})

test('upload paths sit under the artwork path', () => {
  assert.equal(uploadPathOf({ key: 'the-block', kind: 'poster' }), '/api/library/shows/the-block/artwork/poster/uploads')
  assert.equal(uploadRemovePathOf({ key: 'the-block', kind: 'background', id: '0123456789abcdef' }),
    '/api/library/shows/the-block/artwork/background/uploads/0123456789abcdef')
})
