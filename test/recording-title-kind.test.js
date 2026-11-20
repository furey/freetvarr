import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createRecordingTitleKinds, recordingTitleKindOf } from '../src/recording-title-kind.js'

const kinds = new Map([
  ['heat', { kind: 'movie' }],
  ['ncis', { kind: 'series' }],
])

test('a recording takes the stored title kind, by its show title override first', () => {
  assert.equal(recordingTitleKindOf({ recording: { title: 'Heat' }, kinds }), 'movie')
  assert.equal(recordingTitleKindOf({ recording: { title: 'NCIS: Special', show_title_override: 'NCIS' }, kinds }), 'series')
})

test('with no stored kind, the movies or one-off folder decides, and anything else stays unknown', () => {
  const roots = { movies: '/media/movies', oneOffs: '/media/one-offs' }
  assert.equal(recordingTitleKindOf({ recording: { title: 'Gran Turismo', file_path: '/media/movies/Gran Turismo (2023)/Gran Turismo.ts' }, kinds, ...roots }), 'movie')
  assert.equal(recordingTitleKindOf({ recording: { title: 'Carols', file_path: '/media/one-offs/Carols.ts' }, kinds, ...roots }), 'one-off')
  assert.equal(recordingTitleKindOf({ recording: { title: 'Mystery', file_path: '/media/tv/Mystery/S01E01.ts' }, kinds, ...roots }), null)
  assert.equal(recordingTitleKindOf({ recording: { title: 'Mystery', file_path: '/media/movies-old/x.ts' }, kinds, ...roots }), null)
})

test('a failed kinds or roots read leaves the kind unknown instead of failing the list', async () => {
  const kindOf = await createRecordingTitleKinds({
    titleKinds: async () => { throw new Error('db busy') },
    moviesRoot: async () => '/media/movies',
    oneOffRoot: async () => { throw new Error('unset') },
  })
  assert.equal(kindOf({ title: 'Heat', file_path: '/media/tv/Heat.ts' }), null)
  assert.equal(kindOf({ title: 'Heat', file_path: '/media/movies/Heat.ts' }), 'movie')
})
