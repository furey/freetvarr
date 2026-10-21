import { test } from 'node:test'
import assert from 'node:assert/strict'

import { adviceItemsOf, cleanGuideText, stripBoilerplate } from '../src/consumer-advice.js'
import { normaliseEvent, normaliseRecording } from '../src/tvheadend.js'
import {
  adviceLineOf,
  classificationLabelOf,
  shownClassificationOf,
} from '../src/web/ratings-display.js'

test('an episode title made only of boilerplate becomes null and keeps the advice', () => {
  assert.deepEqual(cleanGuideText({ episodeTitle: 'Audio Described (AD). Consumer Advice: L, V.', synopsis: 'The Bride wakes from a coma.' }), {
    episodeTitle: null,
    synopsis: 'The Bride wakes from a coma.',
    advice: ['L', 'V'],
  })
})

test('real SBS episode titles lose the country, advice, and audio description text', () => {
  assert.deepEqual(cleanGuideText({ episodeTitle: 'From: The USA. Audio Described (AD). Consumer Advice: A, L, S, V.' }), {
    episodeTitle: null,
    synopsis: '',
    advice: ['A', 'L', 'S', 'V'],
  })
  assert.deepEqual(cleanGuideText({ episodeTitle: 'From: Croatia. Consumer Advice: A, L, S.' }).advice, ['A', 'L', 'S'])
  assert.equal(cleanGuideText({ episodeTitle: 'Audio Described (AD).' }).episodeTitle, null)
})

test('advice at the end of a synopsis is removed from the text', () => {
  assert.deepEqual(cleanGuideText({ episodeTitle: 'The Final', synopsis: 'Two teams meet in Mexico. Consumer Advice: A.' }), {
    episodeTitle: 'The Final',
    synopsis: 'Two teams meet in Mexico.',
    advice: ['A'],
  })
})

test('advice from the episode title and the synopsis merges without duplicates', () => {
  const cleaned = cleanGuideText({ episodeTitle: 'Consumer Advice: L.', synopsis: 'A story. Consumer Advice: L, V.' })
  assert.deepEqual(cleaned.advice, ['L', 'V'])
})

test('advice words and lower case parse', () => {
  assert.deepEqual(stripBoilerplate('Consumer Advice: Mild Violence.'), { text: '', advice: ['Mild Violence'] })
  assert.deepEqual(stripBoilerplate('consumer advice: l, v'), { text: '', advice: ['L', 'V'] })
  assert.deepEqual(stripBoilerplate('Consumer Advice: Strong Language and Supernatural Themes.'), {
    text: '',
    advice: ['Strong Language', 'Supernatural Themes'],
  })
  assert.deepEqual(adviceItemsOf('A L V'), ['A', 'L', 'V'])
  assert.deepEqual(adviceItemsOf('D; H & N/S'), ['D', 'H', 'N', 'S'])
})

test('text without boilerplate is left alone', () => {
  assert.deepEqual(stripBoilerplate('Rick gives consumer advice to shoppers.'), {
    text: 'Rick gives consumer advice to shoppers.',
    advice: [],
  })
  assert.deepEqual(stripBoilerplate('Audio described tours of the museum begin.'), {
    text: 'Audio described tours of the museum begin.',
    advice: [],
  })
  assert.deepEqual(stripBoilerplate(null), { text: '', advice: [] })
  assert.deepEqual(cleanGuideText({}), { episodeTitle: null, synopsis: '', advice: [] })
})

test('normaliseEvent cleans guide text and carries the advice', () => {
  const event = normaliseEvent({
    eventId: 1,
    channelUuid: 'ch',
    title: 'Kill Bill: Vol. 1',
    subtitle: 'Audio Described (AD). Consumer Advice: L, V.',
    description: 'A former assassin seeks revenge.',
    start: 100,
    stop: 200,
  })
  assert.equal(event.episode_title, null)
  assert.equal(event.synopsis, 'A former assassin seeks revenge.')
  assert.deepEqual(event.advice, ['L', 'V'])
})

test('normaliseRecording cleans the episode title and description', () => {
  const recording = normaliseRecording({
    uuid: 'u1',
    disp_title: 'Heartbreak Ridge',
    disp_subtitle: 'From: The USA. Audio Described (AD). Consumer Advice: A, L, S, V.',
    disp_description: 'A marine sergeant takes command. Consumer Advice: A.',
    start: 100,
    stop: 200,
  })
  assert.equal(recording.episodeTitle, null)
  assert.equal(recording.description, 'A marine sergeant takes command.')
  assert.deepEqual(recording.advice, ['A', 'L', 'S', 'V'])
})

test('advice reads as words in a sentence', () => {
  assert.equal(adviceLineOf(['L', 'V']), 'Language, violence')
  assert.equal(adviceLineOf(['A', 'D', 'H', 'N', 'S']), 'Adult themes, drug references, horror, nudity, sex references')
  assert.equal(adviceLineOf(['Mild Violence', 'l']), 'Mild violence, language')
  assert.equal(adviceLineOf(['V', 'Violence']), 'Violence')
  assert.equal(adviceLineOf([]), '')
  assert.equal(adviceLineOf(null), '')
})

test('the classification card names the rating and lists the advice', () => {
  assert.deepEqual(shownClassificationOf({ classification: 'ma15+', advice: ['L', 'V'] }), {
    code: 'MA15+',
    tone: 'ma',
    adviceLine: 'Language, violence',
    ariaLabel: 'Classified MA15+: language, violence',
  })
  assert.equal(shownClassificationOf({ classification: 'PG' }).ariaLabel, 'Classified PG')
  assert.equal(shownClassificationOf({ classification: 'PG' }).adviceLine, '')
  assert.equal(shownClassificationOf({ classification: 'X' }), null)
})

test('the chip label carries the advice', () => {
  assert.equal(classificationLabelOf({ classification: 'M', advice: ['A'] }), 'Classified M: adult themes')
  assert.equal(classificationLabelOf({ classification: 'G', advice: [] }), 'Classified G')
  assert.equal(classificationLabelOf({ classification: '' }), '')
})

test('a leading SBS country of origin is removed from the episode title', () => {
  assert.deepEqual(cleanGuideText({ episodeTitle: 'From: The USA. Consumer Advice: V.', synopsis: 'A soldier returns from war.' }), {
    episodeTitle: null,
    synopsis: 'A soldier returns from war.',
    advice: ['V'],
  })
  assert.equal(cleanGuideText({ episodeTitle: 'Where the Cows Come From: Part 2.', synopsis: '' }).episodeTitle, 'Where the Cows Come From: Part 2.')
})
