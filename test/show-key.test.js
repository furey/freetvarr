import { test } from 'node:test'
import assert from 'node:assert/strict'
import { showKeyOf, showHrefOf } from '../src/web/show-key.js'

test('showKeyOf: lower-case slug of the title', () => {
  assert.equal(showKeyOf('The Block'), 'the-block')
  assert.equal(showKeyOf('Gruen (2008)'), 'gruen-2008')
  assert.equal(showKeyOf('  Hard Quiz: Kids!  '), 'hard-quiz-kids')
})

test('showKeyOf: accents fold and empty titles get a stable key', () => {
  assert.equal(showKeyOf('Café Société'), 'cafe-societe')
  assert.equal(showKeyOf(''), 'untitled')
  assert.equal(showKeyOf(null), 'untitled')
  assert.equal(showKeyOf('!!!'), 'untitled')
})

test('showHrefOf: links to the show page', () => {
  assert.equal(showHrefOf('The Block'), '#/recordings/show/the-block')
})
