import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-folder-rename-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, setSetting } = await import('../src/db.js')
const { keepShowFolder, keptFolderPatchOf, planFolderFix, renameShowFolder } = await import('../src/show-folder-rename.js')
const { ensureShowFolder, settleShowIdentity } = await import('../src/show-folders.js')
const { chooseShowIdentity, declineShowIdentity, showIdentityStatus } = await import('../src/show-identity-choice.js')
const { loadIdentityPick, saveIdentityPick } = await import('../src/show-identity-store.js')

const AU_IDENTITY = { tvmazeId: '87106', name: 'Big Brother (AU)', tvdbId: '76237', tmdbId: null }
const AU_MATCH = { state: 'confirm', identity: AU_IDENTITY, candidates: [] }
const NEW_FOLDER = 'Big Brother (AU) {tvdb-76237}'
let mediaRoot
let showId
let episodePath

const options = (overrides = {}) => ({
  showId,
  mediaRootOf: async () => mediaRoot,
  refreshPlex: async () => ({ triggered: true }),
  isSyncRunning: () => false,
  isRecordingBusy: () => false,
  ...overrides,
})

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db('library_items').delete()
  await db('show_identity_picks').delete()
  await db('recordings').delete()
  await db('shows').delete()
  mediaRoot = await fs.mkdtemp(path.join(tmpDir, 'tv-'))
  episodePath = path.join(mediaRoot, 'Big Brother', 'Season 17', 'Big Brother - S17E06.ts')
  await fs.mkdir(path.dirname(episodePath), { recursive: true })
  await fs.writeFile(episodePath, 'video')
  await fs.writeFile(`${episodePath}.orig`, 'backup')
  const [id] = await db('shows').insert({ show_pattern: 'Big Brother', dest_folder: 'Big Brother' })
  showId = id
  await db('recordings').insert([
    { recording_id: 'r1', show_id: showId, title: 'Big Brother', season: 17, episode: 6, file_path: episodePath, status: 'done' },
    { recording_id: 'r2', title: 'Big Brother Late', file_path: path.join(mediaRoot, 'Big Brother Late', 'e1.ts'), status: 'done' },
  ])
  await db('library_items').insert({ rating_key: '10', part_id: '1', section_id: '2', kind: 'episode', file_path: episodePath, seen_at: 1 })
})

const folderNames = async () => (await fs.readdir(mediaRoot)).sort()

test('planFolderFix: shows the new name and how many recordings move', async () => {
  const plan = await planFolderFix(options({ identityFor: async () => AU_MATCH }))
  assert.equal(plan.state, 'ready')
  assert.equal(plan.from, 'Big Brother')
  assert.equal(plan.to, NEW_FOLDER)
  assert.equal(plan.recordings, 1)
  assert.equal(plan.folderExists, true)
})

test('planFolderFix: uses the stored identity without a lookup', async () => {
  await db('shows').where({ id: showId }).update({ tvdb_id: '76237', database_title: 'Big Brother (AU)' })
  const plan = await planFolderFix(options({ identityFor: async () => { throw new Error('no lookup expected') } }))
  assert.equal(plan.to, NEW_FOLDER)
})

test('planFolderFix: no match keeps the folder as it is', async () => {
  const plan = await planFolderFix(options({ identityFor: async () => null }))
  assert.equal(plan.state, 'no-match')
})

test('renameShowFolder: renames the folder and updates every stored path in one go', async () => {
  let refreshed = 0
  const result = await renameShowFolder(options({ to: NEW_FOLDER, identity: AU_IDENTITY, refreshPlex: async () => { refreshed++ } }))
  assert.equal(result.moved, true)
  assert.equal(result.recordings, 1)
  assert.equal(refreshed, 1)
  assert.deepEqual(await folderNames(), [NEW_FOLDER])
  const moved = path.join(mediaRoot, NEW_FOLDER, 'Season 17', 'Big Brother - S17E06.ts')
  assert.equal(await fs.readFile(moved, 'utf8'), 'video')
  assert.equal(await fs.readFile(`${moved}.orig`, 'utf8'), 'backup')
  const show = await db('shows').where({ id: showId }).first()
  assert.equal(show.dest_folder, NEW_FOLDER)
  assert.equal(show.tvdb_id, '76237')
  assert.equal(show.database_title, 'Big Brother (AU)')
  assert.equal((await db('recordings').where({ recording_id: 'r1' }).first()).file_path, moved)
  assert.equal((await db('recordings').where({ recording_id: 'r2' }).first()).file_path, path.join(mediaRoot, 'Big Brother Late', 'e1.ts'))
  assert.equal((await db('library_items').first()).file_path, moved)
})

test('renameShowFolder: an existing target folder stops the rename', async () => {
  await fs.mkdir(path.join(mediaRoot, NEW_FOLDER))
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER })), { code: 'target-exists' })
  assert.equal((await db('shows').where({ id: showId }).first()).dest_folder, 'Big Brother')
  assert.equal(await fs.readFile(episodePath, 'utf8'), 'video')
})

test('renameShowFolder: a cross-device rename leaves the database unchanged', async () => {
  const fsApi = { ...fs, rename: async () => { throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' }) } }
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER, fsApi })), { code: 'cross-device' })
  assert.equal((await db('shows').where({ id: showId }).first()).dest_folder, 'Big Brother')
  assert.equal((await db('recordings').where({ recording_id: 'r1' }).first()).file_path, episodePath)
})

test('renameShowFolder: a failed commit renames the folder back', async () => {
  const failingCommit = Object.assign((...args) => db(...args), {
    transaction: (work) => db.transaction(async (trx) => {
      await work(trx)
      throw new Error('disk full')
    }),
  })
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER, database: failingCommit })), /disk full/)
  assert.deepEqual(await folderNames(), ['Big Brother'])
  assert.equal(await fs.readFile(episodePath, 'utf8'), 'video')
  assert.equal((await db('shows').where({ id: showId }).first()).dest_folder, 'Big Brother')
  assert.equal((await db('recordings').where({ recording_id: 'r1' }).first()).file_path, episodePath)
  assert.equal((await db('library_items').first()).file_path, episodePath)
})

test('renameShowFolder: refuses while a sync runs or ad removal works on an episode', async () => {
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER, isSyncRunning: () => true })), { code: 'busy' })
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER, isRecordingBusy: (id) => id === 'r1' })), { code: 'busy' })
  assert.deepEqual(await folderNames(), ['Big Brother'])
})

test('renameShowFolder: refuses a name outside the TV folder', async () => {
  await assert.rejects(renameShowFolder(options({ to: '../elsewhere' })), { code: 'bad-name' })
})

test('renameShowFolder: with no folder on disk yet, only the saved folder changes', async () => {
  await fs.rm(path.join(mediaRoot, 'Big Brother'), { recursive: true })
  const result = await renameShowFolder(options({ to: NEW_FOLDER }))
  assert.equal(result.moved, false)
  assert.equal((await db('shows').where({ id: showId }).first()).dest_folder, NEW_FOLDER)
  assert.deepEqual(await folderNames(), [])
})

test('ensureShowFolder: a new series gets the database title and id folder, and stores the ids', async () => {
  await setSetting('media_root', mediaRoot)
  const seen = []
  const identityFor = async (request) => {
    seen.push(request)
    return { state: 'matched', identity: { tvmazeId: '7', name: 'Gruen', tvdbId: '83281', tmdbId: null }, candidates: [] }
  }
  const airing = { channelName: 'ABC TV', start: 1, durationS: 1800, season: 16, episode: 2 }
  const show = await ensureShowFolder({ title: 'Gruen', shows: [], airing, identityFor })
  assert.equal(show.created, true)
  assert.equal(show.dest_folder, 'Gruen {tvdb-83281}')
  assert.equal(show.tvdb_id, '83281')
  assert.equal(show.database_title, 'Gruen')
  assert.equal(show.identity_state, 'matched')
  assert.equal(show.tvmaze_id, '7')
  assert.deepEqual(seen, [{ ...airing, title: 'Gruen', wait: 5000 }])
})

test('ensureShowFolder: a failed lookup keeps the bare title', async () => {
  await setSetting('media_root', mediaRoot)
  const show = await ensureShowFolder({ title: 'Hard Quiz', shows: [], identityFor: async () => { throw new Error('offline') } })
  assert.equal(show.dest_folder, 'Hard Quiz')
  assert.equal(show.tvdb_id, null)
})

test('ensureShowFolder: a sync makes an automatic title match; Record series claims it as yours', async () => {
  await setSetting('media_root', mediaRoot)
  const identityFor = async () => ({ state: 'none', identity: null, candidates: [] })
  const made = await ensureShowFolder({ title: 'Offsiders', shows: [], identityFor })
  assert.equal(made.origin, 'auto')
  const claimed = await ensureShowFolder({ title: 'Offsiders', shows: [made], identityFor, origin: 'user' })
  assert.equal(claimed.created, false)
  assert.equal((await db('shows').where({ id: made.id }).first()).origin, 'user')
})

const OFFICE_CHOICES = {
  state: 'choose',
  identity: null,
  candidates: [
    { tvmazeId: '526', name: 'The Office', country: 'US', network: 'NBC', years: '2005–2013', identity: { tvmazeId: '526', name: 'The Office (US)', tvdbId: '73244', tmdbId: null, needsConfirm: false }, folder: 'The Office (US) {tvdb-73244}' },
    { tvmazeId: '1214', name: 'The Office', country: 'UK', network: 'BBC Two', years: '2001–2003', identity: { tvmazeId: '1214', name: 'The Office (UK)', tvdbId: '78107', tmdbId: null, needsConfirm: false }, folder: 'The Office (UK) {tvdb-78107}' },
  ],
}

test('showIdentityStatus: lists the shows to choose from when there is no clear winner', async () => {
  const [id] = await db('shows').insert({ show_pattern: 'The Office', dest_folder: 'The Office', identity_state: 'choose' })
  const status = await showIdentityStatus({ showId: id, identityFor: async () => OFFICE_CHOICES })
  assert.equal(status.state, 'choose')
  assert.equal(status.current, null)
  assert.deepEqual(status.candidates.map((candidate) => candidate.folder), ['The Office (US) {tvdb-73244}', 'The Office (UK) {tvdb-78107}'])
})

test('chooseShowIdentity: saves the pick on the show and for the title and network, then offers the rename', async () => {
  const [id] = await db('shows').insert({ show_pattern: 'The Office', dest_folder: 'The Office', identity_state: 'choose' })
  await db('recordings').insert({ recording_id: 'o1', show_id: id, title: 'The Office', file_path: path.join(mediaRoot, 'The Office', 'e1.ts'), channel_name: 'ABC TV Plus', aired_at: 5, status: 'done' })
  const chosen = await chooseShowIdentity({ showId: id, tvmazeId: '1214', identityFor: async () => OFFICE_CHOICES })
  assert.equal(chosen.folder, 'The Office (UK) {tvdb-78107}')
  const show = await db('shows').where({ id }).first()
  assert.equal(show.identity_state, 'chosen')
  assert.equal(show.tvdb_id, '78107')
  assert.equal(show.dest_folder, 'The Office')
  assert.deepEqual(await loadIdentityPick({ titleKey: 'office', family: 'abc' }), { tvmazeId: '1214', name: 'The Office (UK)', tvdbId: '78107', tmdbId: null, needsConfirm: false })
  const plan = await planFolderFix(options({ showId: id, identityFor: async () => { throw new Error('no lookup expected') } }))
  assert.equal(plan.to, 'The Office (UK) {tvdb-78107}')
})

test('chooseShowIdentity: refuses a show that is not in the list', async () => {
  const [id] = await db('shows').insert({ show_pattern: 'The Office', dest_folder: 'The Office' })
  await assert.rejects(chooseShowIdentity({ showId: id, tvmazeId: '999', identityFor: async () => OFFICE_CHOICES }), { code: 'unknown-show' })
})

test('planFolderFix: offers no rename while the owner still has to pick the show', async () => {
  const [id] = await db('shows').insert({ show_pattern: 'The Office', dest_folder: 'The Office', identity_state: 'choose' })
  const plan = await planFolderFix(options({ showId: id, identityFor: async () => ({ ...OFFICE_CHOICES, identity: OFFICE_CHOICES.candidates[0].identity }) }))
  assert.equal(plan.state, 'no-match')
})

test('ensureShowFolder in the background: answers at once with the bare title', async () => {
  await setSetting('media_root', mediaRoot)
  const started = Date.now()
  const show = await ensureShowFolder({ title: 'Hard Quiz', shows: [], inBackground: true, identityFor: () => new Promise(() => {}) })
  assert.ok(Date.now() - started < 1000)
  assert.equal(show.dest_folder, 'Hard Quiz')
})

test('settleShowIdentity: with nothing on disk yet, the folder takes the matched name', async () => {
  await setSetting('media_root', mediaRoot)
  const [id] = await db('shows').insert({ show_pattern: 'Gruen', dest_folder: 'Gruen' })
  const match = { state: 'matched', identity: { tvmazeId: '7', name: 'Gruen', tvdbId: '83281', tmdbId: null }, candidates: [] }
  await settleShowIdentity({ showId: id, title: 'Gruen', identityFor: async () => match })
  const show = await db('shows').where({ id }).first()
  assert.equal(show.dest_folder, 'Gruen {tvdb-83281}')
  assert.equal(show.identity_state, 'matched')
})

test('settleShowIdentity: with recordings already there, only the state changes and Rename folder is offered', async () => {
  await setSetting('media_root', mediaRoot)
  await settleShowIdentity({ showId, title: 'Big Brother', identityFor: async () => AU_MATCH })
  const show = await db('shows').where({ id: showId }).first()
  assert.equal(show.dest_folder, 'Big Brother')
  assert.equal(show.identity_state, 'confirm')
  assert.equal(show.tvdb_id, '76237')
  const plan = await planFolderFix(options({ identityFor: async () => { throw new Error('no lookup expected') } }))
  assert.equal(plan.to, NEW_FOLDER)
})

test('settleShowIdentity: an unclear match keeps the bare folder and asks the owner', async () => {
  await setSetting('media_root', mediaRoot)
  const [id] = await db('shows').insert({ show_pattern: 'The Office', dest_folder: 'The Office' })
  await settleShowIdentity({ showId: id, title: 'The Office', identityFor: async () => OFFICE_CHOICES })
  const show = await db('shows').where({ id }).first()
  assert.equal(show.dest_folder, 'The Office')
  assert.equal(show.identity_state, 'choose')
})

test('renameShowFolder: refuses a folder that Sonarr downloads into, so Sonarr keeps its series path', async () => {
  const sonarrPath = path.join(mediaRoot, 'Big Brother', 'Season 17', 'Big Brother - S17E07 - WEBDL.mkv')
  await fs.writeFile(sonarrPath, 'download')
  await db('library_items').insert({ rating_key: '11', part_id: '2', section_id: '2', kind: 'episode', file_path: sonarrPath, seen_at: 1, manager: 'sonarr', manager_file_id: '9', manager_series_id: '3' })
  const plan = await planFolderFix(options({ identityFor: async () => AU_MATCH }))
  assert.equal(plan.state, 'managed')
  assert.equal(plan.manager, 'Sonarr')
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER })), { code: 'managed' })
  assert.deepEqual(await folderNames(), ['Big Brother'])
  assert.equal((await db('shows').where({ id: showId }).first()).dest_folder, 'Big Brother')
})

test('renameShowFolder: every series that saves to the folder follows the rename', async () => {
  const [otherId] = await db('shows').insert({ show_pattern: 'Big Brother Australia', dest_folder: 'Big Brother' })
  await renameShowFolder(options({ to: NEW_FOLDER }))
  assert.equal((await db('shows').where({ id: otherId }).first()).dest_folder, NEW_FOLDER)
})

test('renameShowFolder: refuses while the library folder sort moves recordings', async () => {
  const { runReclassification } = await import('../src/library-reclassify.js')
  let release
  const sorting = runReclassification({ loadSeries: () => new Promise((resolve) => { release = resolve }) })
  try {
    await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER, isSyncRunning: undefined })), { code: 'busy' })
    assert.deepEqual(await folderNames(), ['Big Brother'])
  } finally {
    release({ series: [] })
    await sorting
  }
})

test('settleShowIdentity: a show the owner picked while the lookup ran keeps the pick', async () => {
  await setSetting('media_root', mediaRoot)
  const [id] = await db('shows').insert({ show_pattern: 'The Office', dest_folder: 'The Office' })
  const picked = OFFICE_CHOICES.candidates[1].identity
  const identityFor = async () => {
    await db('shows').where({ id }).update({ tvmaze_id: picked.tvmazeId, tvdb_id: picked.tvdbId, database_title: picked.name, identity_state: 'chosen' })
    return { state: 'matched', identity: OFFICE_CHOICES.candidates[0].identity, candidates: [] }
  }
  await settleShowIdentity({ showId: id, title: 'The Office', identityFor })
  const show = await db('shows').where({ id }).first()
  assert.equal(show.identity_state, 'chosen')
  assert.equal(show.tvdb_id, '78107')
  assert.equal(show.dest_folder, 'The Office')
})

test('keepShowFolder: Keep this name stops the rename offer until the show is picked again', async () => {
  await keepShowFolder({ showId })
  const plan = await planFolderFix(options({ identityFor: async () => { throw new Error('no lookup expected') } }))
  assert.equal(plan.state, 'kept')
  await db('recordings').where({ recording_id: 'r1' }).update({ channel_name: '10 HD', aired_at: 5 })
  const choices = { state: 'choose', identity: null, candidates: [{ tvmazeId: '87106', name: 'Big Brother', identity: AU_IDENTITY }] }
  await chooseShowIdentity({ showId, tvmazeId: '87106', identityFor: async () => choices })
  assert.equal((await planFolderFix(options())).state, 'ready')
})

test('declineShowIdentity: None of these clears the pick and keeps the plain name', async () => {
  const [id] = await db('shows').insert({ show_pattern: 'The Office', dest_folder: 'The Office', identity_state: 'choose' })
  await db('recordings').insert({ recording_id: 'o1', show_id: id, title: 'The Office', file_path: path.join(mediaRoot, 'The Office', 'e1.ts'), channel_name: 'ABC TV Plus', aired_at: 5, status: 'done' })
  await chooseShowIdentity({ showId: id, tvmazeId: '1214', identityFor: async () => OFFICE_CHOICES })
  await declineShowIdentity({ showId: id })
  const show = await db('shows').where({ id }).first()
  assert.equal(show.identity_state, 'declined')
  assert.equal(show.tvdb_id, null)
  assert.equal(show.dest_folder, 'The Office')
  assert.equal(await loadIdentityPick({ titleKey: 'office', family: 'abc' }), null)
  const plan = await planFolderFix(options({ showId: id, identityFor: async () => { throw new Error('no lookup expected') } }))
  assert.equal(plan.state, 'no-match')
  const status = await showIdentityStatus({ showId: id, identityFor: async () => OFFICE_CHOICES })
  assert.equal(status.state, 'declined')
  await settleShowIdentity({ showId: id, title: 'The Office', identityFor: async () => ({ state: 'matched', identity: OFFICE_CHOICES.candidates[0].identity, candidates: [] }) })
  assert.equal((await db('shows').where({ id }).first()).identity_state, 'declined')
})

test('ensureShowFolder: a slow match in a sync keeps the bare name, then saves the match for Rename folder', async () => {
  await setSetting('media_root', mediaRoot)
  const match = { state: 'matched', identity: { tvmazeId: '7', name: 'Gruen', tvdbId: '83281', tmdbId: null }, candidates: [] }
  let finish
  const settled = new Promise((resolve) => { finish = resolve })
  const identityFor = async ({ wait }) => {
    if (wait === 5000) return { state: 'pending', identity: null, candidates: [] }
    setImmediate(finish)
    return match
  }
  const show = await ensureShowFolder({ title: 'Gruen', shows: [], identityFor })
  assert.equal(show.dest_folder, 'Gruen')
  assert.equal(show.identity_state, null)
  await settled
  await new Promise((resolve) => setTimeout(resolve, 50))
  const saved = await db('shows').where({ id: show.id }).first()
  assert.equal(saved.dest_folder, 'Gruen')
  assert.equal(saved.tvdb_id, '83281')
  assert.equal((await planFolderFix(options({ showId: show.id }))).to, 'Gruen {tvdb-83281}')
})

test('planFolderFix: counts the videos in the folder that Freetvarr did not record', async () => {
  await fs.writeFile(path.join(mediaRoot, 'Big Brother', 'Season 17', 'Big Brother - S17E01.mkv'), 'copy')
  await fs.writeFile(path.join(mediaRoot, 'Big Brother', 'poster.jpg'), 'art')
  const plan = await planFolderFix(options({ identityFor: async () => AU_MATCH }))
  assert.equal(plan.recordings, 1)
  assert.equal(plan.otherVideos, 1)
})

test('loadIdentityPick: a pick made before the channel was known still counts once it is', async () => {
  const office = OFFICE_CHOICES.candidates[1].identity
  await saveIdentityPick({ titleKey: 'office', family: '', identity: office })
  assert.equal((await loadIdentityPick({ titleKey: 'office', family: 'abc' })).tvdbId, '78107')
  await db('show_identity_picks').delete()
  await saveIdentityPick({ titleKey: 'office', family: 'abc', identity: office })
  assert.equal((await loadIdentityPick({ titleKey: 'office', family: '' })).tvdbId, '78107')
  assert.equal(await loadIdentityPick({ titleKey: 'office', family: 'nine' }), null)
  await saveIdentityPick({ titleKey: 'office', family: 'nine', identity: OFFICE_CHOICES.candidates[0].identity })
  assert.equal(await loadIdentityPick({ titleKey: 'office', family: '' }), null)
})

test('chooseShowIdentity: says TVmaze cannot be reached when the list cannot load', async () => {
  const [id] = await db('shows').insert({ show_pattern: 'The Office', dest_folder: 'The Office', identity_state: 'choose' })
  const unreachable = async () => ({ state: 'unreachable', identity: null, candidates: [] })
  await assert.rejects(chooseShowIdentity({ showId: id, tvmazeId: '1214', identityFor: unreachable }), { code: 'unreachable', message: 'Freetvarr cannot reach TVmaze right now. Try again later.' })
  await assert.rejects(chooseShowIdentity({ showId: id, tvmazeId: '1214', identityFor: async () => { throw new Error('offline') } }), { code: 'unreachable' })
})

test('keptFolderPatchOf: a Saves to the owner types by hand is kept', () => {
  const show = { dest_folder: 'Big Brother' }
  assert.deepEqual(keptFolderPatchOf({ show, patch: { dest_folder: 'BB' } }), { kept_folder: 'BB' })
  assert.deepEqual(keptFolderPatchOf({ show, patch: { dest_folder: 'Big Brother' } }), {})
  assert.deepEqual(keptFolderPatchOf({ show, patch: { season_template: 'S{season}' } }), {})
})
