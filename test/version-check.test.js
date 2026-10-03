import { test } from 'node:test'
import assert from 'node:assert/strict'

import { compareVersions, isNewerRelease, latestReleaseTag, parseReleaseVersion } from '../src/web/version-check.js'

test('parseReleaseVersion: reads plain and v-prefixed release tags', () => {
  assert.deepEqual(parseReleaseVersion('1.3.6'), [1, 3, 6])
  assert.deepEqual(parseReleaseVersion('v2.0.10'), [2, 0, 10])
})

test('parseReleaseVersion: prerelease, build, and garbage tags give null', () => {
  for (const tag of ['1.4.0-beta.1', '1.4.0+build', '1.4', 'latest', '', null, undefined, '01.x.2']) {
    assert.equal(parseReleaseVersion(tag), null, String(tag))
  }
})

test('compareVersions: compares each part as a number', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1)
  assert.equal(compareVersions('1.3.6', '1.3.6'), 0)
  assert.equal(compareVersions('1.3.6', '2.0.0'), -1)
})

test('latestReleaseTag: picks the highest release and skips the rest', () => {
  assert.equal(latestReleaseTag(['1.3.6', '1.10.0', '1.9.2', '2.0.0-rc.1', 'nightly']), '1.10.0')
})

test('latestReleaseTag: no release tags gives null', () => {
  assert.equal(latestReleaseTag([]), null)
  assert.equal(latestReleaseTag(['2.0.0-rc.1', 'nightly']), null)
})

test('isNewerRelease: only a higher release counts', () => {
  assert.equal(isNewerRelease({ current: '1.3.6', latest: '1.3.7' }), true)
  assert.equal(isNewerRelease({ current: '1.3.6', latest: '1.3.6' }), false)
  assert.equal(isNewerRelease({ current: '1.3.6', latest: '1.3.5' }), false)
  assert.equal(isNewerRelease({ current: '1.3.6', latest: null }), false)
  assert.equal(isNewerRelease({ current: 'dev', latest: '1.3.7' }), false)
})
