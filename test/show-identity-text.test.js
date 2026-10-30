import { test } from 'node:test'
import assert from 'node:assert/strict'

import { candidateMetaOf, folderFixNoteOf, folderFixOutcomeOf, identityRowOf } from '../src/web/show-identity-text.js'

const OFFICE_UK = { tvmazeId: '1214', name: 'The Office', country: 'UK', network: 'BBC Two', years: '2001–2003' }
const OFFICE_US = { tvmazeId: '526', name: 'The Office', country: 'US', network: 'NBC', years: '2005–2013' }

test('identityRowOf: asks the owner to pick when there is no clear winner', () => {
  const row = identityRowOf({ status: { state: 'choose', current: null, candidates: [OFFICE_US, OFFICE_UK] }, title: 'The Office' })
  assert.equal(row.title, 'Check which show this is')
  assert.match(row.meta, /more than one show called The Office/)
})

test('identityRowOf: asks the owner to check a borrowed match', () => {
  const current = { tvmazeId: '87106', name: 'Big Brother (AU)' }
  const candidate = { tvmazeId: '87106', name: 'Big Brother', country: 'AU', network: 'Network 10', years: '2025–' }
  const row = identityRowOf({ status: { state: 'confirm', current, candidates: [candidate] }, title: 'Big Brother' })
  assert.equal(row.meta, 'Freetvarr thinks this is Big Brother (AU), AU · Network 10 · 2025–. Press to check or change it.')
})

test('identityRowOf: names a matched show with its details', () => {
  const status = { state: 'chosen', current: { tvmazeId: '1214', name: 'The Office (UK)' }, candidates: [OFFICE_US, OFFICE_UK] }
  assert.deepEqual(identityRowOf({ status, title: 'The Office' }), { title: 'The Office (UK)', meta: 'UK · BBC Two · 2001–2003' })
})

test('identityRowOf: says why there is no show, so the row keeps its place', () => {
  const rowFor = (lookup) => identityRowOf({ status: { state: 'none', current: null, candidates: [], lookup }, title: 'Gruen' })
  assert.deepEqual(rowFor('none'), { title: 'No show found', meta: 'TVmaze has no show called Gruen, so the folder keeps the plain name.' })
  assert.equal(rowFor('unreachable').title, 'TVmaze not reachable')
  assert.equal(rowFor('pending').title, 'Still looking')
  assert.equal(rowFor('off').title, 'No show lookups')
  assert.equal(identityRowOf({ status: null, title: 'Gruen' }).title, 'TVmaze not reachable')
  assert.equal(identityRowOf({ status: null, title: 'Gruen', loading: true }).title, 'Looking up the show')
})

test('folderFixNoteOf: says in one line why Rename folder is not offered', () => {
  assert.equal(folderFixNoteOf({ state: 'managed', manager: 'Sonarr' }), 'Sonarr also saves episodes in this folder, so rename the series in Sonarr instead of here.')
  assert.equal(folderFixNoteOf({ state: 'target-exists', to: 'Gruen {tvdb-83281}' }), 'A folder called Gruen {tvdb-83281} is already in your TV library, so Freetvarr cannot rename this folder to it.')
  assert.equal(folderFixNoteOf({ state: 'ready' }), '')
  assert.equal(folderFixNoteOf(null), '')
})

test('identityRowOf: None of these keeps the plain name and offers the picker again', () => {
  const row = identityRowOf({ status: { state: 'declined', current: null, candidates: [OFFICE_US, OFFICE_UK] }, title: 'The Office' })
  assert.deepEqual(row, { title: 'None of these', meta: 'The folder keeps the plain name. Press to pick a show.' })
})

test('folderFixOutcomeOf: says how many videos Freetvarr did not record move with the folder', () => {
  assert.equal(
    folderFixOutcomeOf({ folderExists: true, recordings: 2, otherVideos: 3 }),
    'Freetvarr updates the 2 recordings in it, and new episodes save to the new folder. The folder also holds 3 videos that Freetvarr did not record, such as copies you added yourself. They move with the folder. Plex then rescans your TV library.',
  )
  assert.equal(folderFixOutcomeOf({ folderExists: true, recordings: 1, otherVideos: 0 }), 'Freetvarr updates the 1 recording in it, and new episodes save to the new folder. Plex then rescans your TV library.')
})

test('candidateMetaOf: marks the current show', () => {
  assert.equal(candidateMetaOf({ candidate: OFFICE_UK, current: { tvmazeId: '1214' } }), 'UK · BBC Two · 2001–2003 · Current')
  assert.equal(candidateMetaOf({ candidate: OFFICE_US, current: { tvmazeId: '1214' } }), 'US · NBC · 2005–2013')
})
