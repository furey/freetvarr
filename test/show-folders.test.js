import { test } from 'node:test'
import assert from 'node:assert/strict'

import { existingFolderFor } from '../src/show-folders.js'

test('existingFolderFor: the plain-title folder wins over any suffixed one', () => {
  const folders = ['Ghosts (US)', 'Ghosts', 'Ghosts (2019)']
  assert.equal(existingFolderFor({ title: 'Ghosts', folders }), 'Ghosts')
})

test('existingFolderFor: uses the one year or country folder when it is the only one', () => {
  assert.equal(existingFolderFor({ title: 'Bluey', folders: ['Bluey (2018)', 'Bluey Minisodes'] }), 'Bluey (2018)')
  assert.equal(existingFolderFor({ title: 'The Office', folders: ['The Office (US)'] }), 'The Office (US)')
  assert.equal(existingFolderFor({ title: 'Ghosts', folders: ['Ghosts (US) (2021)'] }), 'Ghosts (US) (2021)')
})

test('existingFolderFor: two suffixed folders give no match, whatever the folder order', () => {
  const folders = ['Ghosts (US)', 'Ghosts (2019)']
  assert.equal(existingFolderFor({ title: 'Ghosts', folders }), undefined)
  assert.equal(existingFolderFor({ title: 'Ghosts', folders: [...folders].reverse() }), undefined)
})

test('existingFolderFor: a folder with other words in brackets is not a year or country suffix', () => {
  assert.equal(existingFolderFor({ title: 'Survivor', folders: ['Survivor (Behind the Scenes)'] }), undefined)
})
