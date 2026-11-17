import { test } from 'node:test'
import assert from 'node:assert/strict'

import { candidateMetaOf, folderFixNoteOf, folderFixOutcomeOf, identityRowOf } from '../src/web/show-identity-text.js'

const OFFICE_UK = { tvmazeId: '1214', name: 'The Office', country: 'UK', network: 'BBC Two', years: '2001–2003' }
const OFFICE_US = { tvmazeId: '526', name: 'The Office', country: 'US', network: 'NBC', years: '2005–2013' }

test('identityRowOf: asks the owner to pick when there is no clear winner', () => {
  const row = identityRowOf({ status: { state: 'choose', current: null, candidates: [OFFICE_US, OFFICE_UK] }, title: 'The Office' })
  assert.equal(row.title, 'Check which show this is')
  assert.match(row.meta, /more than one/i)
  assert.match(row.meta, /The Office/)
})

test('identityRowOf: asks the owner to check a borrowed match', () => {
  const current = { tvmazeId: '87106', name: 'Big Brother (AU)' }
  const candidate = { tvmazeId: '87106', name: 'Big Brother', country: 'AU', network: 'Network 10', years: '2025–' }
  const row = identityRowOf({ status: { state: 'confirm', current, candidates: [candidate] }, title: 'Big Brother' })
  assert.ok(row.meta.includes('Big Brother (AU)'))
  assert.ok(row.meta.includes('AU · Network 10 · 2025–'))
  assert.match(row.meta, /check/i)
  assert.doesNotMatch(row.meta, /more than one|undefined/i)
})

test('identityRowOf: names a matched show with its details', () => {
  const status = { state: 'chosen', current: { tvmazeId: '1214', name: 'The Office (UK)' }, candidates: [OFFICE_US, OFFICE_UK] }
  assert.deepEqual(identityRowOf({ status, title: 'The Office' }), { title: 'The Office (UK)', meta: 'UK · BBC Two · 2001–2003' })
})

test('identityRowOf: says why there is no show, so the row keeps its place', () => {
  const rowFor = (lookup) => identityRowOf({ status: { state: 'none', current: null, candidates: [], lookup }, title: 'Gruen' })
  assert.equal(rowFor('none').title, 'No show found')
  assert.match(rowFor('none').meta, /TVmaze/)
  assert.match(rowFor('none').meta, /Gruen/)
  assert.match(rowFor('none').meta, /plain name/i)
  assert.equal(rowFor('unreachable').title, 'TVmaze not reachable')
  assert.equal(rowFor('pending').title, 'Still looking')
  assert.equal(rowFor('off').title, 'No show lookups')
  assert.equal(identityRowOf({ status: null, title: 'Gruen' }).title, 'TVmaze not reachable')
  assert.equal(identityRowOf({ status: null, title: 'Gruen', loading: true }).title, 'Looking up the show')
})

test('folderFixNoteOf: says in one line why Rename folder is not offered', () => {
  const managed = folderFixNoteOf({ state: 'managed', manager: 'Sonarr' })
  assert.match(managed, /Sonarr/)
  assert.match(managed, /rename/i)
  assert.doesNotMatch(managed, /already|undefined/i)
  const targetExists = folderFixNoteOf({ state: 'target-exists', to: 'Gruen {tvdb-83281}' })
  assert.ok(targetExists.includes('Gruen {tvdb-83281}'))
  assert.match(targetExists, /already/i)
  assert.doesNotMatch(targetExists, /Sonarr|undefined/)
  assert.equal(folderFixNoteOf({ state: 'ready' }), '')
  assert.equal(folderFixNoteOf(null), '')
})

test('identityRowOf: None of these keeps the plain name and offers the picker again', () => {
  const row = identityRowOf({ status: { state: 'declined', current: null, candidates: [OFFICE_US, OFFICE_UK] }, title: 'The Office' })
  assert.equal(row.title, 'None of these')
  assert.match(row.meta, /plain name/i)
  assert.match(row.meta, /pick/i)
})

test('folderFixOutcomeOf: says how many videos Freetvarr did not record move with the folder', () => {
  const withOthers = folderFixOutcomeOf({ folderExists: true, recordings: 2, otherVideos: 3 })
  assert.match(withOthers, /\b2 recordings\b/)
  assert.match(withOthers, /\b3 videos\b/)
  assert.match(withOthers, /\bmove/i)
  assert.match(withOthers, /Plex/)
  const recordingsOnly = folderFixOutcomeOf({ folderExists: true, recordings: 1, otherVideos: 0 })
  assert.match(recordingsOnly, /\b1 recording\b/)
  assert.doesNotMatch(recordingsOnly, /video|undefined|NaN/i)
  assert.match(recordingsOnly, /Plex/)
  assert.match(folderFixOutcomeOf({ folderExists: true, recordings: 2, otherVideos: 1 }), /\b1 video\b/)
})

test('candidateMetaOf: marks the current show', () => {
  assert.equal(candidateMetaOf({ candidate: OFFICE_UK, current: { tvmazeId: '1214' } }), 'UK · BBC Two · 2001–2003 · Current')
  assert.equal(candidateMetaOf({ candidate: OFFICE_US, current: { tvmazeId: '1214' } }), 'US · NBC · 2005–2013')
})
