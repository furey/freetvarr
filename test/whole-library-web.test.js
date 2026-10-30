import { test } from 'node:test'
import assert from 'node:assert/strict'

import { metaPartsOf } from '../src/web/meta-parts.js'
import { arrStatusOf, findResultText, keyPlaceholderOf } from '../src/web/arr-text.js'
import { copySizeText, episodeInfoOf, episodeMenuOf, showMenuOf } from '../src/web/library-menus.js'
import { plexWatchStatusText } from '../src/web/plex-watch-text.js'

const keysOf = (groups) => groups.flat().map((entry) => entry.key)

test('metaPartsOf: the separator stays at the end of a line and short parts stay whole', () => {
  assert.deepEqual(metaPartsOf('Mon 12 Oct · 1 hr 18 mins · Watched'), [
    { text: 'Mon 12 Oct ·', whole: true },
    { text: '1 hr 18 mins ·', whole: true },
    { text: 'Watched', whole: true },
  ])
  const status = plexWatchStatusText({ status: { configured: true, lastRunAt: 1, matched: 32, unmatched: 2 }, nowMs: 2, timeZone: 'UTC' })
  assert.deepEqual(metaPartsOf(status.text).at(-1), { text: '2 waiting for Plex', whole: true })
  assert.equal(metaPartsOf('Plex rejected the token. Check the token above, then press Sync watched now.')[0].whole, false)
  assert.deepEqual(metaPartsOf(''), [])
})

test('arr text: connected, not connected, the key placeholder, and the find result', () => {
  assert.deepEqual(arrStatusOf({ app: 'sonarr', result: { ok: true, version: '4.0.15', count: 12, recycleBin: { on: true, days: 7 } } }), {
    kind: 'ok',
    title: 'Connected',
    detail: 'Sonarr 4.0.15 · 12 series · recycle bin on, 7\u00a0days',
  })
  assert.equal(arrStatusOf({ app: 'radarr', result: { ok: false, error: 'Radarr rejected the API key' } }).detail, 'Radarr rejected the API key')
  assert.equal(arrStatusOf({ app: 'radarr', result: { ok: true, count: 1, recycleBin: { on: false } } }).detail, 'Radarr · 1 film · recycle bin off')
  assert.equal(keyPlaceholderOf({ app: 'radarr', saved: { hasKey: false } }), 'Paste the key from Radarr → Settings → General')
  assert.equal(keyPlaceholderOf({ app: 'sonarr', saved: { hasKey: true, keySource: 'config.xml' } }), '•••••')
  assert.equal(findResultText({ sonarr: { url: 'http://x', keyFound: true }, radarr: { url: 'http://y', keyFound: false } }), 'Sonarr found. Radarr found; paste its API key.')
})

test('episode menus: a Plex episode can play, be marked, show info, and be deleted, but not merged, imported, or ad-scanned', () => {
  const episode = { recordingId: 'plex-7', source: 'plex', status: 'done', filePath: '/tv/a.mkv', playable: true, watched: false, deletedFromTvhAt: 'x', libraryState: null }
  const keys = keysOf(episodeMenuOf({ episode, adRemovalEnabled: true, canMove: true }))
  assert.deepEqual(keys, ['play-start', 'watched', 'episode-info', 'plex', 'delete-episode'])
  const show = { seasons: [{ season: 1, episodes: [episode] }], kind: 'show' }
  assert.equal(keysOf(showMenuOf({ show, canMove: true })).includes('move'), false)
})

test('episodeInfoOf: says where a file came from, and lists both versions of an episode', () => {
  const sonarr = { manager: 'sonarr', filePath: '/tv/x.mkv', sizeBytes: 2.2e9, videoCodec: 'h264', resolution: '1080', audioCodec: 'aac' }
  const plexOnly = episodeInfoOf({ episode: { source: 'plex', versions: [sonarr], episode: 34, episodeTitle: 'Kids Room' }, showTitle: 'The Block', timeZone: 'UTC' })
  assert.equal(plexOnly.note, '')
  assert.deepEqual(plexOnly.rows.slice(-3), [
    { label: 'Came from', value: 'Downloaded by Sonarr' },
    { label: 'File', value: '/tv/x.mkv', mono: true },
    { label: 'Size', value: '2.2 GB · H.264 1080p · AAC' },
  ])
  const both = episodeInfoOf({ episode: { source: 'freetvarr', filePath: '/tv/x.ts', otherVersions: [sonarr], episode: 41 }, showTitle: 'The Block', timeZone: 'UTC' })
  assert.equal(both.note, 'This episode has 2 versions. Freetvarr plays the recording; Plex picks either.')
  assert.ok(both.rows.some((row) => row.label === 'Recording' && row.value === '/tv/x.ts'))
  assert.ok(both.rows.some((row) => row.label === 'Sonarr copy'))
  assert.equal(copySizeText({ sizeBytes: 850e6, videoCodec: 'hevc', resolution: '4k' }), '850 MB · HEVC 4K')
})
