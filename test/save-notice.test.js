import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clearedSecretToastOf, reenterLineOf, rootFieldErrorOf, savedNoticeOf } from '../src/web/save-notice.js'

test('savedNoticeOf: says which secret to enter again after a save clears it', () => {
  assert.equal(savedNoticeOf([]), 'Saved.')
  const one = savedNoticeOf(['tvh_password'])
  assert.match(one, /^Saved\b/)
  assert.match(one, /TVHeadend password/)
  assert.doesNotMatch(one, /Plex|Sonarr|Radarr|undefined/)
  const three = savedNoticeOf(['radarr_api_key', 'plex_token', 'sonarr_api_key'])
  assert.match(three, /^Saved\b.*Plex token.*Sonarr API key.*Radarr API key/)
  assert.doesNotMatch(three, /TVHeadend|undefined/)
  assert.match(reenterLineOf('plex_token'), /Plex token/)
  assert.ok(three.includes(reenterLineOf('plex_token')))
})

const apiError = (message, data) => Object.assign(new Error(message), { data })

test('clearedSecretToastOf: keeps the cleared-secret notice until the user closes it', () => {
  assert.equal(clearedSecretToastOf([]), null)
  const toast = clearedSecretToastOf(['tvh_password'])
  assert.deepEqual({ kind: toast.kind, persist: toast.persist }, { kind: 'info', persist: true })
  assert.equal(toast.text, savedNoticeOf(['tvh_password']))
  assert.match(toast.text, /TVHeadend password/)
})

test('rootFieldErrorOf: names the root field a refused save points at', () => {
  const err = apiError('Media root cannot be /, a system folder.', { field: 'media_root', error: 'Media root cannot be /, a system folder.' })
  assert.deepEqual(rootFieldErrorOf(err), { field: 'media_root', text: 'Media root cannot be /, a system folder.' })
})

test('rootFieldErrorOf: ignores errors with no root field', () => {
  assert.equal(rootFieldErrorOf(apiError('Unknown time zone', {})), null)
  assert.equal(rootFieldErrorOf(apiError('x', { field: 'constructor' })), null)
  assert.equal(rootFieldErrorOf(new Error('network')), null)
})
