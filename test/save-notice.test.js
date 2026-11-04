import { test } from 'node:test'
import assert from 'node:assert/strict'

import { reenterLineOf, rootFieldErrorOf, savedNoticeOf } from '../src/web/save-notice.js'

test('savedNoticeOf: says which secret to enter again after a save clears it', () => {
  assert.equal(savedNoticeOf([]), 'Saved.')
  assert.equal(savedNoticeOf(['tvh_password']), 'Saved. Enter the TVHeadend password again for the new address.')
  assert.equal(
    savedNoticeOf(['radarr_api_key', 'plex_token', 'sonarr_api_key']),
    'Saved. Enter the Plex token again for the new address. Enter the Sonarr API key again for the new address. Enter the Radarr API key again for the new address.',
  )
  assert.equal(reenterLineOf('plex_token'), 'Enter the Plex token again for the new address.')
})

const apiError = (message, data) => Object.assign(new Error(message), { data })

test('rootFieldErrorOf: names the root field a refused save points at', () => {
  const err = apiError('Media root cannot be /, a system folder.', { field: 'media_root', error: 'Media root cannot be /, a system folder.' })
  assert.deepEqual(rootFieldErrorOf(err), { field: 'media_root', text: 'Media root cannot be /, a system folder.' })
})

test('rootFieldErrorOf: ignores errors with no root field', () => {
  assert.equal(rootFieldErrorOf(apiError('Unknown time zone', {})), null)
  assert.equal(rootFieldErrorOf(apiError('x', { field: 'constructor' })), null)
  assert.equal(rootFieldErrorOf(new Error('network')), null)
})
