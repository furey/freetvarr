import { test } from 'node:test'
import assert from 'node:assert/strict'

import { showFieldErrorOf } from '../src/show-fields.js'

test('showFieldErrorOf: an empty, blank, or "." folder or title match is refused', () => {
  for (const value of ['', '   ', '.', ' . ']) {
    assert.equal(showFieldErrorOf({ key: 'dest_folder', value }), 'dest_folder must not be empty')
    assert.equal(showFieldErrorOf({ key: 'show_pattern', value }), 'show_pattern must not be empty')
  }
  assert.equal(showFieldErrorOf({ key: 'season_template', value: '' }), null)
})

test('showFieldErrorOf: folders stay inside the media root, and a normal value passes', () => {
  assert.match(showFieldErrorOf({ key: 'dest_folder', value: '../etc' }), /must stay within the media root/)
  assert.match(showFieldErrorOf({ key: 'season_template', value: '/Season {season}' }), /must stay within the media root/)
  assert.equal(showFieldErrorOf({ key: 'dest_folder', value: 'The Block' }), null)
  assert.equal(showFieldErrorOf({ key: 'show_pattern', value: '../The Block' }), null)
})

test('server: PATCH and POST /api/shows check each field with showFieldErrorOf', async () => {
  const { readFile } = await import('node:fs/promises')
  const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8')
  const patch = server.slice(server.indexOf("app.patch('/api/shows/:id'"), server.indexOf("app.post('/api/shows/:id/folder-fix/keep'"))
  const create = server.slice(server.indexOf("app.post('/api/shows',"), server.indexOf("app.patch('/api/shows/:id'"))
  assert.match(patch, /showFieldErrorOf\(\{ key, value \}\)/)
  assert.match(create, /showFieldErrorOf\(\{ key, value \}\)/)
})
