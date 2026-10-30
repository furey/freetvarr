import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-ad-backups-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const {
  backupKeptUntil,
  backupReconcilePatchOf,
  isBackupExpired,
  processRecordingAds,
  pruneCutOriginals,
  restoreOriginal,
  swapInCut,
} = await import('../src/commercials.js')
const { isRestorablePath, adScanModeOf } = await import('../src/ad-original-routes.js')

const ORIGINAL = 'intro|AD|part one|AD|part two'
const DAY_MS = 86_400_000
const RECORDING_ID = 'rec-1'
let episodeDir
let filePath

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  episodeDir = path.join(tmpDir, `tv-${Date.now()}-${Math.random().toString(16).slice(2)}`, 'The Block', 'Season 22')
  await fs.mkdir(episodeDir, { recursive: true })
  filePath = path.join(episodeDir, 'The Block - S22E35.ts')
  await fs.writeFile(filePath, ORIGINAL)
  await db('recordings').delete()
  await db('recordings').insert({ recording_id: RECORDING_ID, title: 'The Block', status: 'done', file_path: filePath })
})

const read = (file) => fs.readFile(file, 'utf8')
const exists = (file) => fs.access(file).then(() => true, () => false)
const row = () => db('recordings').where({ recording_id: RECORDING_ID }).first()

const fakeTools = ({ adsToRemove = Infinity, seen = [] } = {}) => ({
  detect: async ({ filePath: source }) => {
    const text = await read(source)
    seen.push(text)
    return text.includes('|AD|') ? [{ start: 10, end: 20 }] : []
  },
  cut: async ({ filePath: source, workdir }) => {
    let text = await read(source)
    for (let i = 0; i < adsToRemove && text.includes('|AD|'); i += 1) text = text.replace('|AD|', '|')
    const outPath = path.join(workdir, 'out.ts')
    await fs.writeFile(outPath, text)
    return outPath
  },
})

const cut = (tools) => processRecordingAds({ filePath, mode: 'cut', recordingId: RECORDING_ID, tools })

test('first cut keeps the true original as .orig and starts the keep period', async () => {
  const result = await cut(fakeTools())
  assert.equal(result.status, 'cut')
  assert.equal(await read(filePath), 'intro|part one|part two')
  assert.equal(await read(`${filePath}.orig`), ORIGINAL)
  const saved = await row()
  assert.equal(saved.ad_status, 'cut')
  assert.ok(saved.ad_cut_at)
  assert.ok(saved.ad_backup_saved_at)
  assert.equal(Boolean(saved.ad_backup_uncut), true)
  assert.equal(Number(saved.size), Buffer.byteLength('intro|part one|part two'))
})

test('re-cut within the keep period starts from the original, keeps it byte-equal, and keeps its date', async () => {
  await cut(fakeTools({ adsToRemove: 1 }))
  assert.equal(await read(filePath), 'intro|part one|AD|part two')
  const firstSavedAt = (await row()).ad_backup_saved_at
  const seen = []
  await new Promise((resolve) => setTimeout(resolve, 1100))
  const result = await cut(fakeTools({ seen }))
  assert.equal(result.status, 'cut')
  assert.deepEqual(seen, [ORIGINAL])
  assert.equal(await read(filePath), 'intro|part one|part two')
  assert.deepEqual(await fs.readFile(`${filePath}.orig`), Buffer.from(ORIGINAL))
  const saved = await row()
  assert.equal(saved.ad_backup_saved_at, firstSavedAt)
  assert.equal(Boolean(saved.ad_backup_uncut), true)
})

test('re-cut after the original was pruned backs up the current cut and says it is not the original', async () => {
  await cut(fakeTools({ adsToRemove: 1 }))
  const pruned = await pruneCutOriginals({ nowMs: Date.now() + 30 * DAY_MS })
  assert.equal(pruned, 1)
  assert.equal(await exists(`${filePath}.orig`), false)
  assert.equal((await row()).ad_backup_saved_at, null)
  const seen = []
  await cut(fakeTools({ seen }))
  assert.deepEqual(seen, ['intro|part one|AD|part two'])
  assert.equal(await read(`${filePath}.orig`), 'intro|part one|AD|part two')
  assert.equal(await read(filePath), 'intro|part one|part two')
  const saved = await row()
  assert.ok(saved.ad_backup_saved_at)
  assert.equal(Boolean(saved.ad_backup_uncut), false)
})

test('a re-scan from the original that finds no breaks puts the original back and clears the cut state', async () => {
  await cut(fakeTools())
  const noBreaks = { detect: async () => [], cut: async () => { throw new Error('cut must not run') } }
  const result = await cut(noBreaks)
  assert.equal(result.status, 'no_breaks')
  assert.equal(result.restored, true)
  assert.deepEqual(await fs.readFile(filePath), Buffer.from(ORIGINAL))
  assert.equal(await exists(`${filePath}.orig`), false)
  assert.equal(await exists(path.join(episodeDir, 'The Block - S22E35.edl')), false)
  const saved = await row()
  assert.equal(saved.ad_status, 'no_breaks')
  assert.equal(saved.ad_cut_at, null)
  assert.equal(saved.ad_backup_saved_at, null)
  assert.equal(saved.ad_breaks_json, null)
  assert.equal(Number(saved.size), Buffer.byteLength(ORIGINAL))
})

test('the original is pruned after the keep period whatever the last scan found', async () => {
  await cut(fakeTools())
  const noBreaks = { detect: async () => [], cut: async () => { throw new Error('cut must not run') } }
  const result = await processRecordingAds({ filePath, mode: 'detect', recordingId: RECORDING_ID, tools: noBreaks })
  assert.equal(result.status, 'no_breaks')
  assert.equal(result.restored, false)
  assert.equal(await read(filePath), 'intro|part one|part two')
  assert.equal(await pruneCutOriginals({ nowMs: Date.now() + DAY_MS }), 0)
  assert.equal(await read(`${filePath}.orig`), ORIGINAL)
  assert.equal(await pruneCutOriginals({ nowMs: Date.now() + 8 * DAY_MS }), 1)
  assert.equal(await exists(`${filePath}.orig`), false)
  assert.equal((await row()).ad_status, 'no_breaks')
})

test('find ads scans the episode file itself and never makes a backup', async () => {
  const seen = []
  const result = await processRecordingAds({ filePath, mode: 'detect', recordingId: RECORDING_ID, tools: fakeTools({ seen }) })
  assert.equal(result.status, 'detected')
  assert.deepEqual(seen, [ORIGINAL])
  assert.equal(await read(filePath), ORIGINAL)
  assert.equal(await exists(`${filePath}.orig`), false)
  assert.equal(await exists(path.join(episodeDir, 'The Block - S22E35.edl')), true)
})

test('restoreOriginal puts the original back, removes the backup, and clears the ad state', async () => {
  await cut(fakeTools())
  const result = await restoreOriginal({ recordingId: RECORDING_ID, filePath })
  assert.equal(result.restored, true)
  assert.equal(result.uncut, true)
  assert.equal(await read(filePath), ORIGINAL)
  assert.equal(await exists(`${filePath}.orig`), false)
  const saved = await row()
  assert.equal(saved.ad_status, null)
  assert.equal(saved.ad_cut_at, null)
  assert.equal(saved.ad_backup_saved_at, null)
  assert.equal(Number(saved.size), Buffer.byteLength(ORIGINAL))
})

test('restoreOriginal refuses when the backup is gone', async () => {
  assert.deepEqual(await restoreOriginal({ recordingId: RECORDING_ID, filePath }), { error: 'gone' })
  assert.equal(await read(filePath), ORIGINAL)
})

test('swapInCut: the first swap makes the backup, a later swap only replaces the episode', async () => {
  const outPath = path.join(episodeDir, 'out-1.ts')
  await fs.writeFile(outPath, 'cut one')
  assert.deepEqual(await swapInCut({ filePath, outPath }), { backupCreated: true })
  await fs.writeFile(outPath, 'cut two')
  assert.deepEqual(await swapInCut({ filePath, outPath }), { backupCreated: false })
  assert.equal(await read(filePath), 'cut two')
  assert.equal(await read(`${filePath}.orig`), ORIGINAL)
})

test('backupKeptUntil and isBackupExpired read SQLite and ISO times', () => {
  assert.equal(backupKeptUntil({ savedAt: '2026-10-01 10:00:00', retentionDays: 7 }), '2026-10-08T10:00:00.000Z')
  assert.equal(backupKeptUntil({ savedAt: '2026-10-01T10:00:00.000Z', retentionDays: 3 }), '2026-10-04T10:00:00.000Z')
  assert.equal(backupKeptUntil({ savedAt: null, retentionDays: 7 }), null)
  assert.equal(isBackupExpired({ savedAt: '2026-10-01 10:00:00', retentionDays: 7, nowMs: Date.parse('2026-10-08T09:59:00Z') }), false)
  assert.equal(isBackupExpired({ savedAt: '2026-10-01 10:00:00', retentionDays: 7, nowMs: Date.parse('2026-10-08T10:00:00Z') }), true)
})

test('backupReconcilePatchOf: adopts a backup the database missed and forgets one that is gone', () => {
  const now = '2026-10-22T00:00:00.000Z'
  assert.deepEqual(
    backupReconcilePatchOf({ row: { ad_processed_at: '2026-10-20 08:00:00', ad_cut_at: null, ad_backup_saved_at: null }, hasBackup: true, now }),
    { ad_backup_saved_at: '2026-10-20 08:00:00', ad_backup_uncut: true, ad_cut_at: '2026-10-20 08:00:00' },
  )
  assert.deepEqual(
    backupReconcilePatchOf({ row: { ad_backup_saved_at: '2026-10-20 08:00:00' }, hasBackup: false, now }),
    { ad_backup_saved_at: null, ad_backup_uncut: null },
  )
  assert.equal(backupReconcilePatchOf({ row: { ad_backup_saved_at: null }, hasBackup: false, now }), null)
})

test('isRestorablePath: only full paths inside a library folder', () => {
  const roots = { tv: '/data/tv', oneOff: '/data/one-offs', film: '' }
  assert.equal(isRestorablePath({ filePath: '/data/tv/The Block/S22E35.ts', roots }), true)
  assert.equal(isRestorablePath({ filePath: '/data/tv/../etc/passwd', roots }), false)
  assert.equal(isRestorablePath({ filePath: 'relative/file.ts', roots }), false)
  assert.equal(isRestorablePath({ filePath: null, roots }), false)
})

test('adScanModeOf: a show with ad removal off finds ads only', () => {
  assert.equal(adScanModeOf('off'), 'detect')
  assert.equal(adScanModeOf(null), 'detect')
  assert.equal(adScanModeOf('detect'), 'detect')
  assert.equal(adScanModeOf('cut'), 'cut')
})
