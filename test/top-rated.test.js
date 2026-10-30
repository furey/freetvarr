import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  filmFactsByKeyOf,
  filmFactsForTitlesOf,
  hasRealScore,
  isOtherLanguage,
  otherLanguageChoiceFrom,
  otherLanguageLimitOf,
  weightedScoreOf,
  withinLanguageLimit,
} from '../src/top-rated.js'

test('the vote-weighted score ranks many votes above a few high ones', () => {
  const fewVotes = weightedScoreOf({ score: 9.0, votes: 3 })
  const manyVotes = weightedScoreOf({ score: 8.4, votes: 20000 })
  assert.ok(manyVotes > fewVotes)
  assert.ok(Math.abs(manyVotes - 8.4) < 0.2)
  assert.ok(weightedScoreOf({ score: 7.5, votes: 5000 }) > weightedScoreOf({ score: 7.5, votes: 100 }))
})

test('a real score is a positive number, never a missing one', () => {
  assert.equal(hasRealScore({ score: 7.2 }), true)
  assert.equal(hasRealScore({ score: null }), false)
  assert.equal(hasRealScore({ score: 0 }), false)
  assert.equal(hasRealScore(null), false)
})

test('film facts come from film rating rows, preferring the undated lookup', () => {
  const rows = [
    { lookup_key: 'tmdb:movie:pianist@2002', found_json: JSON.stringify({ score: 8.3, votes: 9000, originalLanguage: 'en' }) },
    { lookup_key: 'tmdb:movie:pianist', found_json: JSON.stringify({ score: 8.4, votes: 9500, originalLanguage: 'en' }) },
    { lookup_key: 'tmdb:movie:amelie@2001', found_json: JSON.stringify({ score: 7.9, votes: 12000, originalLanguage: 'fr' }) },
    { lookup_key: 'tmdb:the block', found_json: JSON.stringify({ score: 6 }) },
    { lookup_key: 'tmdb:movie:broken', found_json: '{' },
  ]
  const facts = filmFactsByKeyOf(rows)
  assert.deepEqual([...facts.keys()].sort(), ['amelie', 'pianist'])
  assert.deepEqual(facts.get('pianist'), { score: 8.4, votes: 9500, originalLanguage: 'en' })
  const byTitle = filmFactsForTitlesOf({ titles: ['The Pianist', 'Amelie', 'Unknown'], factsByKey: facts, keyOf: (title) => title.toLowerCase().replace(/^the /, '') })
  assert.deepEqual([...byTitle.keys()], ['The Pianist', 'Amelie'])
})

test('another language means a known original language other than English', () => {
  assert.equal(isOtherLanguage({ originalLanguage: 'fr' }), true)
  assert.equal(isOtherLanguage({ originalLanguage: 'en' }), false)
  assert.equal(isOtherLanguage({ originalLanguage: null }), false)
  assert.equal(isOtherLanguage(null), false)
})

test('the language choice defaults to a few and caps other-language films per row', () => {
  assert.equal(otherLanguageChoiceFrom(null), 'few')
  assert.equal(otherLanguageChoiceFrom('none'), 'none')
  assert.equal(otherLanguageLimitOf('all'), Infinity)
  assert.equal(otherLanguageLimitOf('junk'), 2)
  const entries = ['en', 'fr', 'ja', 'en', 'ko'].map((language, index) => ({ index, language }))
  const isOther = (entry) => entry.language !== 'en'
  assert.deepEqual(withinLanguageLimit({ entries, isOther, limit: 2 }).map((entry) => entry.index), [0, 1, 2, 3])
  assert.deepEqual(withinLanguageLimit({ entries, isOther, limit: 0 }).map((entry) => entry.index), [0, 3])
  assert.equal(withinLanguageLimit({ entries, isOther, limit: Infinity }).length, 5)
})
