import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  artworkPathOf, candidatesPathOf, emptyPicturesText, pictureChangedText, pictureGroupsOf, pictureResetText, tmdbNoteOf,
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
  assert.match(emptyPicturesText('background'), /^No backgrounds/)
})

test('picker paths encode the show key and kind', () => {
  assert.equal(artworkPathOf({ key: 'the-block', kind: 'poster' }), '/api/library/shows/the-block/artwork/poster')
  assert.equal(candidatesPathOf('a b'), '/api/library/shows/a%20b/artwork-candidates')
})
