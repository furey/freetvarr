import { db } from '../../src/db.js'
import { showKeyOf } from '../../src/web/show-key.js'
import { MANIFEST_FILE, readJson } from './pack-lib.mjs'

const BASE = (process.env.FREETVARR_URL || 'http://127.0.0.1:3801').replace(/\/$/, '')
const CATEGORY_ROWS = ['cooking', 'reality', 'home']
const TITLES_PER_ROW = 4
const EPISODES_PER_ROW = { cooking: 8, reality: 11, home: 6 }
const GUIDE_DAYS = 7
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const PROGRAMME_S = 3600

const main = async () => {
  const manifest = await readJson(MANIFEST_FILE)
  const channelOf = await channelsByTitle()
  const nowMs = Date.now()
  const rows = CATEGORY_ROWS.flatMap((row) => manifest.rows[row]
    .map((key) => manifest.titles.find((title) => title.key === key)?.title)
    .filter((title) => title && channelOf.has(title))
    .slice(0, TITLES_PER_ROW)
    .flatMap((title, index) => householdEventsOf({ title, channelId: channelOf.get(title), index, episodes: EPISODES_PER_ROW[row], nowMs })))
  await db.batchInsert('user_events', rows, 50)
  console.log(`[pack-household] ${rows.length} watch and record events for the ${CATEGORY_ROWS.join(', ')} rows`)
  const dated = await seedFilmYears(manifest)
  console.log(`[pack-household] release years on ${dated} film recordings and Plex items`)
}

const seedFilmYears = async (manifest) => {
  const films = manifest.titles.filter((title) => title.kind === 'film' && title.facts?.year)
  let dated = 0
  for (const { title, facts } of films) {
    dated += await db('recordings').where({ title }).update({ year: facts.year })
    dated += await db('library_items').where({ title, kind: 'movie' }).update({ year: facts.year })
  }
  return dated
}

const channelsByTitle = async () => {
  const byTitle = new Map()
  for (let day = 0; day < GUIDE_DAYS; day += 1) {
    const guide = await (await fetch(`${BASE}/api/epg/guide?day=${day}`)).json()
    for (const [channelId, programmes] of Object.entries(guide.programs || {})) {
      for (const programme of programmes) if (!byTitle.has(programme.title)) byTitle.set(programme.title, channelId)
    }
  }
  return byTitle
}

const householdEventsOf = ({ title, channelId, index, episodes, nowMs }) => Array.from({ length: episodes }, (_, episode) => {
  const programmeStart = nowMs - (episode + 1) * WEEK_MS - ((index % 5) + 2) * HOUR_MS
  const base = { series_key: showKeyOf(title), title, programme_start: programmeStart, channel_id: String(channelId) }
  return [
    { ...base, ts: programmeStart - DAY_MS, kind: 'record_request', source: 'guide', meta_json: JSON.stringify({ type: 'episode' }) },
    {
      ...base,
      ts: programmeStart + HOUR_MS,
      kind: 'watch_end',
      duration_s: PROGRAMME_S - 300,
      position_s: PROGRAMME_S - 300,
      programme_len_s: PROGRAMME_S,
      source: 'live',
      meta_json: JSON.stringify({ attended: true }),
    },
  ]
}).flat()

try {
  await main()
} finally {
  await db.destroy()
}
