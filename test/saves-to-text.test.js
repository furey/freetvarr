import { test } from 'node:test'
import assert from 'node:assert/strict'

import { libraryNoteOf, unfiledShowText } from '../src/web/saves-to-text.js'

test('unfiledShowText: a series with no folder gets a new folder on the next import', () => {
  assert.equal(
    unfiledShowText({ kind: 'newFolder', path: '/media/tv/Bluey' }),
    'This show has no folder in your TV library yet. The next import makes a new folder for it: /media/tv/Bluey.',
  )
})

test('unfiledShowText: a show moved to One-offs names the one-off folder', () => {
  assert.equal(
    unfiledShowText({ kind: 'oneOff', path: '/media/one-offs/Bluey' }),
    'This show is in One-offs, so its episodes save to /media/one-offs/Bluey.',
  )
})

test('unfiledShowText: with nowhere to save, episodes wait in the recording log', () => {
  assert.match(unfiledShowText({ kind: 'held', path: null }), /wait in the recording log/)
  assert.match(unfiledShowText(null), /wait in the recording log/)
})

test('libraryNoteOf: a matching folder or a film names where the recording goes', () => {
  const program = { title: 'Hard Quiz', series_link: 'x' }
  assert.deepEqual(
    libraryNoteOf({ program, addToLibrary: true, folder: { dest_folder: 'Hard Quiz (2016)' } }),
    { text: 'Episodes go into Hard Quiz (2016) in your TV library.', changeable: true },
  )
  assert.match(libraryNoteOf({ program: { kind: 'movie' }, addToLibrary: true, moviesFolderSet: true }).text, /movies folder/)
  assert.match(libraryNoteOf({ program, addToLibrary: false }).text, /Stays in TVHeadend/)
})

test('libraryNoteOf: with no folder, the note gives the import rule instead of promising the one-off folder', () => {
  const single = libraryNoteOf({ program: { title: 'Grand Final' }, addToLibrary: true })
  assert.match(single.text, /season number in the TV guide, or recordings on two or more days, put it in a show folder/)
  assert.match(single.text, /Otherwise it goes to the one-off folder\.$/)
  const episode = libraryNoteOf({ program: { title: 'Bluey', series_link: 'x' }, addToLibrary: true })
  assert.match(episode.text, /Record series gives the series its own folder/)
  assert.equal(episode.changeable, true)
  assert.doesNotMatch(episode.text, /^Record puts this airing in the one-off folder/)
})
