import { test } from 'node:test'
import assert from 'node:assert/strict'

import { candidateMetaOf, identityRowOf } from '../src/web/show-identity-text.js'

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

test('identityRowOf: shows nothing without a match or candidates', () => {
  assert.equal(identityRowOf({ status: { state: 'none', current: null, candidates: [] }, title: 'Gruen' }), null)
  assert.equal(identityRowOf({ status: null, title: 'Gruen' }), null)
})

test('candidateMetaOf: marks the current show', () => {
  assert.equal(candidateMetaOf({ candidate: OFFICE_UK, current: { tvmazeId: '1214' } }), 'UK · BBC Two · 2001–2003 · Current')
  assert.equal(candidateMetaOf({ candidate: OFFICE_US, current: { tvmazeId: '1214' } }), 'US · NBC · 2005–2013')
})
