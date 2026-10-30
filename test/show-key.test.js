import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knownShowTitleOf, rememberShowTitle, showKeyOf, showHrefOf } from '../src/web/show-key.js'

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

test('showHrefOf: remembers the title it links to, so the show page can paint it before loading', () => {
  showHrefOf('Gruen (2008)')
  assert.equal(knownShowTitleOf('gruen-2008'), 'Gruen (2008)')
  assert.equal(knownShowTitleOf('never-linked'), '')
})

test('rememberShowTitle: returns the key and ignores titles without one', () => {
  assert.equal(rememberShowTitle('  Hard Quiz  '), 'hard-quiz')
  assert.equal(knownShowTitleOf('hard-quiz'), 'Hard Quiz')
  assert.equal(rememberShowTitle(''), 'untitled')
  assert.equal(knownShowTitleOf('untitled'), '')
})
