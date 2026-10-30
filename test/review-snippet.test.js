import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isQuotable,
  judgementCountOf,
  pickReviewSnippet,
  plainTextOf,
  sentencesOf,
  snippetScoreOf,
} from '../src/review-snippet.js'

const HEAT_REVIEWS = [
  {
    author: 'filmbuff_77',
    author_details: { rating: 9 },
    content: '<p>Mann builds the whole film around two professionals who respect each other.</p>\r\n\r\n'
      + '**Pacino and De Niro are superb, and the downtown shootout is the most gripping sequence of the decade.** '
      + 'The ending, where one of them dies, still hits hard. I watched it twice.',
  },
  {
    author: 'quietcinema',
    author_details: { rating: 6 },
    content: 'I think it runs long. The score is great, but the subplot with the wife drags on for far too long.\n\n'
      + 'SPOILER: the twist in the third act is telegraphed from the airport scene onwards.',
  },
  {
    author: 'reelnotes',
    author_details: { rating: null },
    content: 'A crime saga with real weight, shot in a cold blue Los Angeles that feels utterly lived in. '
      + 'Read my full review at https://example.com/heat-review for more.',
  },
]

test('the picker chooses the judgement-heavy sentence from the review closest to the average', () => {
  assert.equal(
    pickReviewSnippet({ reviews: HEAT_REVIEWS, average: 8.3 }),
    'Pacino and De Niro are superb, and the downtown shootout is the most gripping sequence of the decade.',
  )
})

test('no quotable sentence means no snippet', () => {
  assert.equal(pickReviewSnippet({ reviews: [{ content: 'Too short.' }], average: 7 }), null)
  assert.equal(pickReviewSnippet({ reviews: [], average: 7 }), null)
  assert.equal(pickReviewSnippet(), null)
})

test('HTML, markdown, links, and entities are stripped to plain text', () => {
  assert.equal(
    plainTextOf('<p>A <em>great</em> film &amp; a **superb** cast.</p>\n> [Read more](https://x.test/a) _now_'),
    'A great film & a superb cast. Read more now',
  )
})

test('sentences split on terminal punctuation and lose wrapping quotes', () => {
  assert.deepEqual(sentencesOf('"It works." Then it stops! Why? 2 hours later, done…'), [
    'It works.',
    'Then it stops!',
    'Why?',
    '2 hours later, done…',
  ])
})

test('sentences outside 50 to 170 characters are not quotable', () => {
  assert.equal(isQuotable('A great film.'), false)
  assert.equal(isQuotable(`A great film ${'with a long tail '.repeat(10)}.`), false)
  assert.equal(isQuotable('A great film with a cast that knows exactly what it is doing.'), true)
})

test('spoiler-risk sentences are dropped', () => {
  for (const word of ['spoiler', 'ending', 'twist', 'dies', 'killed', 'death of', 'finale']) {
    assert.equal(isQuotable(`A beautiful and moving story, right up to the ${word} in the last reel.`), false, word)
  }
})

test('first-person sentences need a judgement word', () => {
  assert.equal(isQuotable('I watched this one on a rainy Sunday afternoon with my brother.'), false)
  assert.equal(isQuotable('I found the cast superb from the first scene to the very last.'), true)
})

test('judgement words are counted per occurrence', () => {
  assert.equal(judgementCountOf('Great cast, great score, and a gripping middle act.'), 3)
  assert.equal(judgementCountOf('A film about a bank job in Los Angeles.'), 0)
})

test('the score weighs judgement words, rating distance, and first position', () => {
  const sentence = 'A gripping and superb crime film with a great cast.'
  assert.equal(snippetScoreOf({ sentence, rating: 8, average: 8 }), 9)
  assert.equal(snippetScoreOf({ sentence, rating: 5, average: 8 }), 6)
  assert.equal(snippetScoreOf({ sentence, rating: null, average: 8 }), 6)
  assert.equal(snippetScoreOf({ sentence, isFirst: true, rating: 8, average: 8 }), 8)
})

test('between equal judgement counts, the review closest to the average wins', () => {
  const reviews = [
    { author_details: { rating: 3 }, content: 'Opening line here. The cast is great and the pacing is tight from start to end.' },
    { author_details: { rating: 8 }, content: 'Opening line here. The score is great and the city looks cold and lived in all night.' },
  ]
  assert.equal(pickReviewSnippet({ reviews, average: 8 }), 'The score is great and the city looks cold and lived in all night.')
})
