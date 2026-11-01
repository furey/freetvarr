import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-reclassify-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, setSetting } = await import('../src/db.js')
const { planReclassification, runReclassification, runReclassificationOnce, RECLASSIFY_DONE_KEY } = await import('../src/library-reclassify.js')

const roots = { mediaRoot: path.join(tmpDir, 'tv'), oneOffRoot: path.join(tmpDir, 'one-offs'), moviesRoot: path.join(tmpDir, 'movies') }
const AIRED = new Date(2026, 9, 28, 19, 30).getTime()

const row = (overrides) => ({
  recording_id: 'r1',
  title: 'Big Brother',
  show_title_override: null,
  episode_title: 'Episode 4',
  season: 17,
  episode: 4,
  aired_at: AIRED,
  status: 'done',
  show_id: null,
  purged_at: null,
  genres_json: '[]',
  file_path: path.join(roots.oneOffRoot, 'Big Brother', 'Big Brother - 2026-10-28 1930 - Episode 4.ts'),
  ...overrides,
})

before(async () => {
  await db.migrate.latest()
  await Promise.all(Object.entries(roots).map(([key, folder]) => setSetting({ mediaRoot: 'media_root', oneOffRoot: 'oneoff_root', moviesRoot: 'movies_root' }[key], folder)))
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('planReclassification: a series filed as a one-off moves into a new TV folder', () => {
  const [move] = planReclassification({ rows: [row()], roots })
  assert.equal(move.from, row().file_path)
  assert.equal(move.to, path.join(roots.mediaRoot, 'Big Brother', 'Season 17', 'Big Brother - S17E04.ts'))
  assert.equal(move.toShows, true)
  assert.equal(move.showId, null)
  assert.equal(move.showPattern, 'Big Brother')
})

test('planReclassification: an existing title match and an existing folder name are reused', () => {
  const shows = [{ id: 7, show_pattern: 'Love Island', dest_folder: 'Love Island Australia (2018)' }]
  const love = row({ title: 'Love Island Australia', season: 8, episode: 4, file_path: path.join(roots.oneOffRoot, 'Love Island Australia', 'x.ts') })
  const [move] = planReclassification({ rows: [love], shows, roots })
  assert.equal(move.showId, 7)
  assert.equal(move.to, path.join(roots.mediaRoot, 'Love Island Australia (2018)', 'Season 08', 'Love Island Australia (2018) - S08E04.ts'))
  const [named] = planReclassification({ rows: [love], folders: ['Love Island Australia'], roots })
  assert.equal(named.to, path.join(roots.mediaRoot, 'Love Island Australia', 'Season 08', 'Love Island Australia - S08E04.ts'))
})

test('planReclassification: one-off events, films, and shows already in the TV folder stay put', () => {
  const cup = row({ recording_id: 'c1', title: 'Melbourne Cup', season: 2026, episode: 1, genres_json: '[64]', file_path: path.join(roots.oneOffRoot, 'Melbourne Cup', 'cup.ts') })
  const film = row({ recording_id: 'f1', title: 'Heat', season: null, episode: null, file_path: path.join(roots.moviesRoot, 'Heat', 'Heat.ts') })
  const block = row({ recording_id: 'b1', title: 'The Block', show_id: 1, file_path: path.join(roots.mediaRoot, 'The Block', 'Season 22', 'b.ts') })
  assert.deepEqual(planReclassification({ rows: [cup, film, block], roots }), [])
})

test('planReclassification: Move to One-offs takes a show out of the TV folder', () => {
  const block = row({ recording_id: 'b1', title: 'The Block', show_id: 1, file_path: path.join(roots.mediaRoot, 'The Block', 'Season 22', 'b.ts') })
  const [move] = planReclassification({ rows: [block], overrides: new Map([['the-block', 'one-off']]), roots })
  assert.equal(move.toShows, false)
  assert.equal(path.dirname(move.to), path.join(roots.oneOffRoot, 'The Block'))
})

test('runReclassification: moves the file and its sidecars, adds the title match, and never overwrites', async () => {
  const bb = row()
  const taken = row({ recording_id: 'r2', episode: 5, episode_title: 'Episode 5', file_path: path.join(roots.oneOffRoot, 'Big Brother', 'e5.ts') })
  for (const file of [bb.file_path, `${bb.file_path}.orig`, bb.file_path.replace(/\.ts$/, '.edl'), taken.file_path]) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, 'video')
  }
  const blocked = path.join(roots.mediaRoot, 'Big Brother', 'Season 17', 'Big Brother - S17E05.ts')
  await fs.mkdir(path.dirname(blocked), { recursive: true })
  await fs.writeFile(blocked, 'someone else')
  await db('recordings').insert([bb, taken])

  const result = await runReclassification({ loadSeries: async () => ({ series: [] }), identityFor: async () => null })
  assert.deepEqual(result, { moved: 1, skipped: 1, planned: 2 })

  const target = path.join(roots.mediaRoot, 'Big Brother', 'Season 17', 'Big Brother - S17E04.ts')
  assert.equal(await fs.readFile(target, 'utf8'), 'video')
  assert.equal(await fs.readFile(`${target}.orig`, 'utf8'), 'video')
  assert.equal(await fs.readFile(target.replace(/\.ts$/, '.edl'), 'utf8'), 'video')
  assert.equal(await fs.readFile(blocked, 'utf8'), 'someone else')
  const show = await db('shows').where({ show_pattern: 'Big Brother' }).first()
  const moved = await db('recordings').where({ recording_id: 'r1' }).first()
  assert.equal(moved.file_path, target)
  assert.equal(moved.show_id, show.id)
  assert.equal((await db('recordings').where({ recording_id: 'r2' }).first()).file_path, taken.file_path)
})

test('runReclassificationOnce: runs again at the next start until nothing is left to skip', async () => {
  await fs.rm(path.join(roots.mediaRoot, 'Big Brother', 'Season 17', 'Big Brother - S17E05.ts'))
  await db('settings').where({ key: RECLASSIFY_DONE_KEY }).delete()
  const result = await runReclassificationOnce({ loadSeries: async () => ({ series: [] }), identityFor: async () => null })
  assert.equal(result.moved, 1)
  assert.ok(await db('settings').where({ key: RECLASSIFY_DONE_KEY }).first())
  assert.equal(await runReclassificationOnce({ loadSeries: async () => ({ series: [] }), identityFor: async () => null }), null)
})

test('runReclassification: a new series folder follows the matched show name and id', async () => {
  const gruen = row({
    recording_id: 'r3',
    title: 'Gruen',
    season: 16,
    episode: 2,
    episode_title: 'Episode 2',
    file_path: path.join(roots.oneOffRoot, 'Gruen', 'Gruen - 2026-10-28 1930 - Episode 2.ts'),
  })
  await fs.mkdir(path.dirname(gruen.file_path), { recursive: true })
  await fs.writeFile(gruen.file_path, 'video')
  await db('recordings').insert(gruen)
  const identityFor = async () => ({ state: 'matched', identity: { tvmazeId: '7', name: 'Gruen', tvdbId: '83281', tmdbId: null }, candidates: [] })
  const result = await runReclassification({ loadSeries: async () => ({ series: [] }), identityFor })
  assert.equal(result.moved, 1)
  const target = path.join(roots.mediaRoot, 'Gruen {tvdb-83281}', 'Season 16', 'Gruen - S16E02.ts')
  assert.equal(await fs.readFile(target, 'utf8'), 'video')
  assert.equal((await db('recordings').where({ recording_id: 'r3' }).first()).file_path, target)
  assert.equal((await db('shows').where({ show_pattern: 'Gruen' }).first()).dest_folder, 'Gruen {tvdb-83281}')
})

const { saveDatabaseIds } = await import('../src/series-evidence.js')
const { ONE_OFF_PLACEHOLDER } = await import('../src/one-off-placeholder.js')

const fileOf = async (file) => {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, 'video')
}

const exists = (file) => fs.access(file).then(() => true, () => false)

test('runReclassification: a moved-in series leaves the placeholder file in the one-offs folder', async () => {
  assert.equal(await exists(path.join(roots.oneOffRoot, ONE_OFF_PLACEHOLDER)), true)
})

test('runReclassification: the World Cup filed under an automatic title match moves to One-offs and stays there', async () => {
  const [showId] = await db('shows').insert({ show_pattern: 'Rugby League World Cup 2026', dest_folder: 'Rugby League World Cup 2026', identity_state: 'none', origin: 'auto' })
  const game = row({
    recording_id: 'rlwc-15',
    title: 'Rugby League World Cup 2026',
    season: 26,
    episode: 15,
    episode_title: 'Tonga v Samoa',
    show_id: showId,
    genres_json: '[64]',
    file_path: path.join(roots.mediaRoot, 'Rugby League World Cup 2026', 'Season 26', 'Rugby League World Cup 2026 - S26E15 - Tonga v Samoa.ts'),
  })
  await fileOf(game.file_path)
  await db('recordings').insert(game)
  await saveDatabaseIds({ key: 'rugby-league-world-cup-2026', databaseIds: 'none' })

  const result = await runReclassification({ loadSeries: async () => ({ series: [] }), identityFor: async () => null })
  assert.equal(result.moved, 1)
  assert.equal(result.retired, 1)
  const moved = await db('recordings').where({ recording_id: 'rlwc-15' }).first()
  assert.equal(path.dirname(path.dirname(moved.file_path)), roots.oneOffRoot)
  assert.equal(moved.show_id, null)
  assert.equal((await db('shows').where({ id: showId }).first()).enabled, 0)
  assert.equal(await exists(path.join(roots.mediaRoot, 'Rugby League World Cup 2026')), false)

  const again = await runReclassification({ loadSeries: async () => ({ series: [] }), identityFor: async () => null })
  assert.deepEqual(again, { moved: 0, skipped: 0, planned: 0 })
  assert.equal((await db('recordings').where({ recording_id: 'rlwc-15' }).first()).file_path, moved.file_path)
})

test('runReclassification: a title moved to One-offs by hand retires its automatic title match and empty folder', async () => {
  const [showId] = await db('shows').insert({ show_pattern: 'NRLW', dest_folder: 'NRLW', origin: 'auto' })
  await fs.mkdir(path.join(roots.mediaRoot, 'NRLW', 'Season 26'), { recursive: true })
  const game = row({ recording_id: 'nrlw-1', title: 'NRLW', season: 26, episode: 3, file_path: path.join(roots.oneOffRoot, 'NRLW', 'NRLW - 2026-10-28 1930.ts') })
  await fileOf(game.file_path)
  await db('recordings').insert(game)
  await db('programme_kind_overrides').insert({ show_key: 'nrlw', kind: 'one-off', title: 'NRLW', updated_at: Date.now() })

  const result = await runReclassification({ loadSeries: async () => ({ series: [] }), identityFor: async () => null })
  assert.equal(result.retired, 1)
  assert.equal((await db('shows').where({ id: showId }).first()).enabled, 0)
  assert.equal(await exists(path.join(roots.mediaRoot, 'NRLW')), false)
  assert.equal((await db('recordings').where({ recording_id: 'nrlw-1' }).first()).file_path, game.file_path)
})

test('runReclassification: a sport title with no stored answer is looked up once, and no id sends it to One-offs', async () => {
  const [showId] = await db('shows').insert({ show_pattern: 'AFLW', dest_folder: 'AFLW', origin: 'auto' })
  const games = [3, 4].map((episode) => row({
    recording_id: `aflw-${episode}`,
    title: 'AFLW',
    season: 26,
    episode,
    aired_at: AIRED + episode * 7 * 24 * 60 * 60 * 1000,
    show_id: showId,
    genres_json: '[64]',
    file_path: path.join(roots.mediaRoot, 'AFLW', 'Season 26', `AFLW - S26E0${episode}.ts`),
  }))
  for (const game of games) await fileOf(game.file_path)
  await db('recordings').insert(games)
  const asked = []
  const identityFor = async (request) => {
    asked.push(request)
    return { state: 'matched', identity: { tvmazeId: '9', name: 'AFLW', tvdbId: null, tmdbId: null }, candidates: [] }
  }

  const result = await runReclassification({ loadSeries: async () => ({ series: [] }), identityFor })
  assert.equal(result.moved, 2)
  assert.deepEqual(asked.map(({ title, wait }) => [title, wait]), [['AFLW', 5000]])
  assert.equal((await db('series_evidence').where({ show_key: 'aflw' }).first()).database_ids, 'none')
  assert.equal((await db('shows').where({ id: showId }).first()).enabled, 0)
})

test('runReclassification: a sport title you added a title match for stays in TV', async () => {
  const [showId] = await db('shows').insert({ show_pattern: 'Super Netball', dest_folder: 'Super Netball', origin: 'user' })
  const game = row({
    recording_id: 'netball-1',
    title: 'Super Netball',
    season: 26,
    episode: 1,
    show_id: showId,
    genres_json: '[64]',
    file_path: path.join(roots.mediaRoot, 'Super Netball', 'Season 26', 'Super Netball - S26E01.ts'),
  })
  await fileOf(game.file_path)
  await db('recordings').insert(game)
  await saveDatabaseIds({ key: 'super-netball', databaseIds: 'none' })
  const result = await runReclassification({ loadSeries: async () => ({ series: [] }), identityFor: async () => null })
  assert.equal(result.moved, 0)
  assert.equal((await db('shows').where({ id: showId }).first()).enabled, 1)
})
