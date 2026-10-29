import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  blockedReasonOf,
  bytesFreed,
  classifyFsError,
  deletionPatch,
  deletionRequestFrom,
  deletionTargets,
  expectedCountFrom,
  isSafeTarget,
  previewDeletion,
  rootFor,
  runDeletion,
  summarise,
} from '../src/library-delete.js'

let tmpDir
let roots
let recordingsRoot

before(async () => {
  tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-library-delete-')))
  roots = { tv: path.join(tmpDir, 'tv'), oneOff: path.join(tmpDir, 'one-offs'), film: path.join(tmpDir, 'movies') }
  recordingsRoot = path.join(tmpDir, 'recordings')
  await Promise.all([...Object.values(roots), recordingsRoot].map((dir) => fs.mkdir(dir, { recursive: true })))
})

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const row = (overrides) => ({
  recording_id: 'r1',
  title: 'The Block',
  episode_title: null,
  season: 22,
  episode: 35,
  status: 'done',
  ad_status: null,
  file_path: null,
  tvh_filename: null,
  deleted_from_tvh_at: null,
  library_deleted_at: null,
  library_replacement: null,
  ...overrides,
})

const fakeTvh = ({ active = [], outcome = 'removed', fail = null } = {}) => {
  const removed = []
  return {
    removed,
    activeIds: new Set(active),
    sourcePathFor: (r) => (r.tvh_filename ? path.join(recordingsRoot, r.tvh_filename) : null),
    remove: async (id) => {
      if (fail) throw new Error(fail)
      removed.push(id)
      return outcome
    },
  }
}

const fakePlex = () => {
  const refreshed = []
  return { refreshed, refresh: async (kind) => { refreshed.push(kind); return { triggered: true } } }
}

const exists = (file) => fs.lstat(file).then(() => true, () => false)

const placeEpisode = async ({ show = 'The Block', season = 22, name, body = 'mpeg-ts', sidecars = true }) => {
  const dir = path.join(roots.tv, show, `Season ${season}`)
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${name}.ts`)
  await fs.writeFile(file, body)
  if (sidecars) {
    await fs.writeFile(path.join(dir, `${name}.edl`), '1\t2\t3\n')
    await fs.writeFile(`${file}.orig`, 'original')
  }
  return file
}

test('deletionRequestFrom: accepts recording ids or a show scope, rejects the rest', () => {
  assert.deepEqual(deletionRequestFrom({ recording_ids: ['a', 'a', 'b'] }), { request: { recordingIds: ['a', 'b'] } })
  assert.deepEqual(deletionRequestFrom({ show_key: 'the-block', scope: 'watched' }), { request: { showKey: 'the-block', scope: 'watched' } })
  assert.ok(deletionRequestFrom({ recording_ids: [] }).error)
  assert.ok(deletionRequestFrom({ recording_ids: [1] }).error)
  assert.ok(deletionRequestFrom({ show_key: 'the-block', scope: 'some' }).error)
  assert.ok(deletionRequestFrom({}).error)
})

test('expectedCountFrom: only whole numbers count', () => {
  assert.equal(expectedCountFrom({ expected_count: 3 }), 3)
  assert.equal(expectedCountFrom({ expected_count: 0 }), 0)
  assert.equal(expectedCountFrom({ expected_count: '3' }), null)
  assert.equal(expectedCountFrom({ expected_count: -1 }), null)
  assert.equal(expectedCountFrom({}), null)
})

test('blockedReasonOf: a running sync, an import or an ad scan blocks the delete', () => {
  assert.match(blockedReasonOf({ rows: [], syncing: true }), /sync is running/)
  assert.match(blockedReasonOf({ rows: [row({ status: 'importing' })], syncing: false }), /The Block S22E35 is still being imported/)
  assert.match(blockedReasonOf({ rows: [row({ ad_status: 'scanning' })], syncing: false }), /scanned for ad breaks/)
  assert.equal(blockedReasonOf({ rows: [row()], syncing: false }), null)
})

test('rootFor: picks the deepest library folder that holds the file', () => {
  const nested = { tv: '/media', film: '/media/movies' }
  assert.deepEqual(rootFor('/media/movies/Heat (1995)/Heat.ts', nested), { kind: 'film', root: '/media/movies' })
  assert.deepEqual(rootFor('/media/The Block/x.ts', nested), { kind: 'tv', root: '/media' })
  assert.equal(rootFor('/media', nested), null)
  assert.equal(rootFor('/mediashare/x.ts', nested), null)
})

test('deletionTargets: derives the file, its .edl and its .orig, never the replacement', () => {
  const file = path.join(roots.tv, 'The Block', 'Season 22', 'The Block S22E35.ts')
  const targets = deletionTargets(row({ file_path: file }), roots)
  assert.equal(targets.kind, 'tv')
  assert.equal(targets.file, file)
  assert.deepEqual(targets.sidecars, [file.replace(/\.ts$/, '.edl'), `${file}.orig`])
  const replaced = deletionTargets(row({ file_path: file, library_replacement: file }), roots)
  assert.equal(replaced.file, null)
})

test('deletionTargets: refuses traversal out of the library and relative paths', () => {
  assert.match(deletionTargets(row({ file_path: path.join(roots.tv, '..', '..', 'etc', 'passwd') }), roots).error, /outside/)
  assert.match(deletionTargets(row({ file_path: 'The Block/x.ts' }), roots).error, /full path/)
  assert.deepEqual(deletionTargets(row(), roots), { file: null, sidecars: [] })
})

test('isSafeTarget: the file must sit below the root', () => {
  assert.equal(isSafeTarget({ realFile: '/media/tv/a/b.ts', realRoot: '/media/tv' }), true)
  assert.equal(isSafeTarget({ realFile: '/media/tv', realRoot: '/media/tv' }), false)
  assert.equal(isSafeTarget({ realFile: '/media/tvx/b.ts', realRoot: '/media/tv' }), false)
})

test('bytesFreed: counts a hard-linked file once, and only when its last link goes', () => {
  const link = { dev: 1, ino: 9, size: 100, nlink: 2 }
  assert.equal(bytesFreed([link]), 0)
  assert.equal(bytesFreed([link, { ...link, nlink: 1 }]), 100)
  assert.equal(bytesFreed([{ dev: 1, ino: 1, size: 5, nlink: 1 }, { dev: 2, ino: 1, size: 7, nlink: 1 }]), 12)
})

test('classifyFsError: a missing file is fine, a read-only folder is a plain failure', () => {
  assert.deepEqual(classifyFsError({ code: 'ENOENT' }), { status: 'missing' })
  assert.deepEqual(classifyFsError({ code: 'EROFS' }), { status: 'failed', error: 'The library folder is read-only' })
  assert.equal(classifyFsError({ code: 'EACCES' }).status, 'failed')
  assert.match(classifyFsError({ code: 'EIO' }).error, /EIO/)
})

test('summarise and deletionPatch: partial failures give 207 and keep failed TVHeadend rows', () => {
  assert.equal(summarise([{ ok: true }]).httpStatus, 200)
  assert.deepEqual(summarise([{ ok: true }, { ok: false }]), { okCount: 1, failedCount: 1, httpStatus: 207 })
  const now = '2026-10-19T00:00:00.000Z'
  assert.deepEqual(deletionPatch({ row: row(), result: { library: 'deleted', tvh: 'removed' }, now }), {
    library_deleted_at: now, library_choice: 'exclude', deleted_from_tvh_at: now, purged_at: now,
  })
  assert.deepEqual(deletionPatch({ row: row(), result: { library: 'deleted', tvh: 'failed' }, now }), {
    library_deleted_at: now, library_choice: 'exclude',
  })
  assert.equal(deletionPatch({ row: row(), result: { library: 'failed', tvh: 'skipped' }, now }), null)
})

test('runDeletion: deletes the file and sidecars, clears empty folders, removes from TVHeadend, refreshes Plex once', async () => {
  const first = await placeEpisode({ show: 'Gone Show', season: 1, name: 'Gone Show S01E01' })
  const second = await placeEpisode({ show: 'Gone Show', season: 1, name: 'Gone Show S01E02', sidecars: false })
  const tvh = fakeTvh()
  const plex = fakePlex()
  const saved = []
  const { results, plex: plexResults } = await runDeletion({
    rows: [row({ recording_id: 'a', file_path: first }), row({ recording_id: 'b', file_path: second })],
    roots, tvh, plex, save: async (entry) => saved.push(entry),
  })
  assert.deepEqual(results.map((r) => [r.recordingId, r.ok, r.library, r.tvh]), [['a', true, 'deleted', 'removed'], ['b', true, 'deleted', 'removed']])
  assert.equal(await exists(path.join(roots.tv, 'Gone Show')), false)
  assert.equal(await exists(roots.tv), true)
  assert.deepEqual(tvh.removed, ['a', 'b'])
  assert.deepEqual(plex.refreshed, ['tv'])
  assert.deepEqual(plexResults, { tv: { triggered: true } })
  assert.equal(saved.length, 2)
  assert.ok(saved[0].patch.purged_at)
})

test('runDeletion: counts a hard link shared with TVHeadend once, after both links go', async () => {
  const source = path.join(recordingsRoot, 'shared.ts')
  await fs.writeFile(source, 'x'.repeat(1000))
  const dir = path.join(roots.tv, 'Linked', 'Season 1')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, 'Linked S01E01.ts')
  await fs.link(source, file)
  const tvh = fakeTvh()
  const preview = await previewDeletion({ rows: [row({ file_path: file, tvh_filename: 'shared.ts' })], roots, tvh })
  assert.equal(preview.bytes, 1000)
  const tvhRemovingFile = { ...tvh, remove: async () => { await fs.unlink(source); return 'removed' } }
  const { results, bytesFreed: total } = await runDeletion({
    rows: [row({ file_path: file, tvh_filename: 'shared.ts' })], roots, tvh: tvhRemovingFile, plex: fakePlex(),
  })
  assert.equal(results[0].bytesFreed, 1000)
  assert.equal(total, 1000)
})

test('runDeletion: refuses a Season folder that is a symlink out of the library', async () => {
  const outside = path.join(tmpDir, 'outside')
  await fs.mkdir(outside, { recursive: true })
  const victim = path.join(outside, 'Escape S01E01.ts')
  await fs.writeFile(victim, 'keep me')
  await fs.mkdir(path.join(roots.tv, 'Escape'), { recursive: true })
  await fs.symlink(outside, path.join(roots.tv, 'Escape', 'Season 1'))
  const tvh = fakeTvh()
  const { results } = await runDeletion({
    rows: [row({ file_path: path.join(roots.tv, 'Escape', 'Season 1', 'Escape S01E01.ts') })], roots, tvh, plex: fakePlex(),
  })
  assert.equal(results[0].ok, false)
  assert.equal(results[0].library, 'failed')
  assert.equal(results[0].tvh, 'skipped')
  assert.match(results[0].error, /outside the library folder/)
  assert.equal(await exists(victim), true)
  assert.deepEqual(tvh.removed, [])
})

test('runDeletion: refuses a library file that is itself a symlink', async () => {
  const target = path.join(tmpDir, 'outside', 'target.ts')
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, 'keep me')
  const dir = path.join(roots.tv, 'Linky', 'Season 1')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, 'Linky S01E01.ts')
  await fs.symlink(target, file)
  const { results } = await runDeletion({ rows: [row({ file_path: file })], roots, tvh: fakeTvh(), plex: fakePlex() })
  assert.match(results[0].error, /not a regular file/)
  assert.equal(await exists(target), true)
})

test('runDeletion: a read-only library skips TVHeadend; partial failure is reported per item', async () => {
  const readOnly = await placeEpisode({ show: 'Locked', season: 1, name: 'Locked S01E01', sidecars: false })
  const fine = await placeEpisode({ show: 'Open', season: 1, name: 'Open S01E01', sidecars: false })
  const readOnlyFs = {
    ...fs,
    unlink: async (file) => {
      if (file.includes('Locked')) throw Object.assign(new Error('read-only'), { code: 'EROFS' })
      return fs.unlink(file)
    },
  }
  const tvh = fakeTvh()
  const { results } = await runDeletion({
    rows: [row({ recording_id: 'locked', file_path: readOnly }), row({ recording_id: 'open', file_path: fine })],
    roots, tvh, plex: fakePlex(), fs: readOnlyFs,
  })
  assert.deepEqual(results[0], {
    recordingId: 'locked', ok: false, library: 'failed', tvh: 'skipped', bytesFreed: 0, error: 'The library folder is read-only',
  })
  assert.equal(results[1].ok, true)
  assert.deepEqual(tvh.removed, ['open'])
  assert.equal(summarise(results).httpStatus, 207)
  assert.equal(await exists(readOnly), true)
})

test('runDeletion: a file already gone still removes the TVHeadend recording', async () => {
  const tvh = fakeTvh()
  const plex = fakePlex()
  const { results } = await runDeletion({
    rows: [row({ file_path: path.join(roots.tv, 'Nowhere', 'Season 1', 'Nowhere S01E01.ts') })], roots, tvh, plex,
  })
  assert.deepEqual([results[0].ok, results[0].library, results[0].tvh], [true, 'missing', 'removed'])
  assert.deepEqual(plex.refreshed, [])
})

test('runDeletion: keeps a file another tool put in place of the recording', async () => {
  const replacement = await placeEpisode({ show: 'Sonarr Show', season: 1, name: 'Sonarr Show - S01E01 - WEB', sidecars: false })
  const original = path.join(path.dirname(replacement), 'Sonarr Show S01E01.ts')
  const { results } = await runDeletion({
    rows: [row({ file_path: original, library_replacement: replacement })], roots, tvh: fakeTvh(), plex: fakePlex(),
  })
  assert.equal(results[0].library, 'kept_replacement')
  assert.equal(results[0].ok, true)
  assert.equal(await exists(replacement), true)
})

test('runDeletion: keeps a file another recording still owns', async () => {
  const shared = await placeEpisode({ show: 'Shared', season: 1, name: 'Shared - S01E01' })
  const ownedElsewhere = async (r) => r.file_path === shared
  const tvh = fakeTvh()
  const { results } = await runDeletion({
    rows: [row({ file_path: shared })], roots, tvh, plex: fakePlex(), ownedElsewhere,
  })
  assert.deepEqual([results[0].ok, results[0].library, results[0].tvh], [true, 'kept_shared', 'removed'])
  assert.equal(await exists(shared), true)
  const preview = await previewDeletion({ rows: [row({ file_path: shared })], roots, tvh: fakeTvh(), ownedElsewhere })
  assert.deepEqual([preview.bytes, preview.missingCount], [0, 0])
})

test('runDeletion: refuses an episode that is still recording', async () => {
  const tvh = fakeTvh({ active: ['live'] })
  const { results } = await runDeletion({ rows: [row({ recording_id: 'live' })], roots, tvh, plex: fakePlex() })
  assert.deepEqual([results[0].ok, results[0].library, results[0].tvh], [false, 'skipped', 'skipped'])
  assert.match(results[0].error, /still recording/)
  assert.deepEqual(tvh.removed, [])
})

test('runDeletion: a TVHeadend failure after the library delete is a partial result', async () => {
  const file = await placeEpisode({ show: 'Half', season: 1, name: 'Half S01E01', sidecars: false })
  const saved = []
  const { results } = await runDeletion({
    rows: [row({ file_path: file })], roots, tvh: fakeTvh({ fail: 'connection refused' }), plex: fakePlex(),
    save: async (entry) => saved.push(entry),
  })
  assert.deepEqual([results[0].ok, results[0].library, results[0].tvh], [false, 'deleted', 'failed'])
  assert.match(results[0].error, /connection refused/)
  assert.equal(saved[0].patch.purged_at, undefined)
  assert.ok(saved[0].patch.library_deleted_at)
})

test('previewDeletion: totals the bytes and counts missing files', async () => {
  const file = await placeEpisode({ show: 'Preview', season: 1, name: 'Preview S01E01', body: 'x'.repeat(50) })
  const preview = await previewDeletion({
    rows: [
      row({ recording_id: 'p1', file_path: file }),
      row({ recording_id: 'p2', file_path: path.join(roots.tv, 'Preview', 'Season 1', 'Gone.ts') }),
    ],
    roots,
    tvh: fakeTvh(),
  })
  assert.equal(preview.count, 2)
  assert.equal(preview.missingCount, 1)
  assert.equal(preview.items[0].bytes, 50 + 6 + 8)
  assert.deepEqual(preview.items.map((item) => item.missing), [false, true])
  assert.equal(preview.bytes, 64)
  assert.equal(await exists(file), true)
})
