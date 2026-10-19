import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FALLBACK_ATTRIBUTION, dataCreditsOf } from '../src/web/data-credits.js'

test('dataCreditsOf turns attribution into credits with licence links', () => {
  const [tvmaze, wikidata] = dataCreditsOf(FALLBACK_ATTRIBUTION)
  assert.equal(tvmaze.note, 'Show genres and some artwork from TVmaze.')
  assert.equal(tvmaze.lead, 'Show genres and some artwork')
  assert.equal(tvmaze.siteHref, 'https://www.tvmaze.com')
  assert.equal(tvmaze.licenceHref, 'https://creativecommons.org/licenses/by-sa/4.0/')
  assert.equal(wikidata.licence, 'CC0')
  assert.equal(wikidata.licenceHref, 'https://creativecommons.org/publicdomain/zero/1.0/')
})

test('dataCreditsOf falls back when the server sends none, and links an unknown licence to the site', () => {
  assert.equal(dataCreditsOf(undefined).length, FALLBACK_ATTRIBUTION.length)
  const [other] = dataCreditsOf([{ name: 'X', url: 'https://x.test', licence: 'Custom', use: 'posters' }])
  assert.equal(other.licenceHref, 'https://x.test')
  assert.equal(other.note, 'Posters from X.')
})
