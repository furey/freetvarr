import { test } from 'node:test'
import assert from 'node:assert/strict'

import { freeDestination, withCopySuffix } from '../src/sync.js'

const TV_PATH = '/media/tv/Show/Season 17/Show - S17E02.ts'
const candidateFor = (copy) => withCopySuffix(TV_PATH, copy)

const libraryOf = ({ owners = {}, files = {} }) => ({
  ownersOf: async (filePath) => owners[filePath] ?? [],
  statOf: async (filePath) => files[filePath] ?? null,
})

const foreignFile = { dev: 1, ino: 100, size: 10 }
const sourceFile = { dev: 1, ino: 200, size: 20 }

test('withCopySuffix: keeps the first copy and numbers the rest before the extension', () => {
  assert.equal(withCopySuffix(TV_PATH, 1), TV_PATH)
  assert.equal(withCopySuffix(TV_PATH, 2), '/media/tv/Show/Season 17/Show - S17E02 - copy 2.ts')
})

test('freeDestination: an empty path is used as is', async () => {
  const result = await freeDestination({ candidateFor, recordingId: 'r1', ...libraryOf({}) })
  assert.deepEqual(result, { filePath: TV_PATH, takenPath: null })
})

test('freeDestination: a file Freetvarr does not own is never the target', async () => {
  const library = libraryOf({ files: { [TV_PATH]: foreignFile, '/src.ts': sourceFile } })
  const result = await freeDestination({ candidateFor, recordingId: 'r1', sourcePath: '/src.ts', ...library })
  assert.deepEqual(result, { filePath: candidateFor(2), takenPath: TV_PATH })
})

test('freeDestination: skips every taken copy name', async () => {
  const library = libraryOf({ files: { [TV_PATH]: foreignFile, [candidateFor(2)]: foreignFile } })
  const result = await freeDestination({ candidateFor, recordingId: 'r1', ...library })
  assert.equal(result.filePath, candidateFor(3))
})

test('freeDestination: a file another recording owns is never the target', async () => {
  const library = libraryOf({ owners: { [TV_PATH]: ['r2'] } })
  const result = await freeDestination({ candidateFor, recordingId: 'r1', ...library })
  assert.equal(result.filePath, candidateFor(2))
})

test('freeDestination: a re-import keeps the path this recording already owns', async () => {
  const library = libraryOf({ owners: { [TV_PATH]: ['r1'] }, files: { [TV_PATH]: foreignFile } })
  const result = await freeDestination({ candidateFor, recordingId: 'r1', ...library })
  assert.deepEqual(result, { filePath: TV_PATH, takenPath: null })
})

test('freeDestination: a hard link to the TVHeadend file counts as this recording', async () => {
  const library = libraryOf({ files: { [TV_PATH]: { ...sourceFile }, '/src.ts': sourceFile } })
  const result = await freeDestination({ candidateFor, recordingId: 'r1', sourcePath: '/src.ts', ...library })
  assert.equal(result.filePath, TV_PATH)
})
