import { db } from './db.js'
import { hasEpisodeDetails } from './episode-details.js'
import { KIND_OVERRIDES, MOVIE, NOT_MOVIE, ONE_OFF_KIND as ONE_OFF_OVERRIDE, SHOW_KIND } from './programme-kind.js'
import { showKeyOf } from './web/show-key.js'

export const MOVIE_KIND = 'movie'
export const SERIES_KIND = 'series'
export const ONE_OFF_KIND = 'one-off'
export const TITLE_KINDS = [MOVIE_KIND, SERIES_KIND, ONE_OFF_KIND]
export const KIND_SOURCES = { override: 'override', library: 'library', guide: 'guide', hint: 'hint' }

export const kindHintFrom = (value) => (TITLE_KINDS.includes(value) ? value : null)

export const decideTitleKind = (evidence) => {
  const { override, library, guide, hint } = evidenceOf(evidence)
  const overridden = OVERRIDE_KINDS[override]
  if (overridden) return { kind: overridden, source: KIND_SOURCES.override }
  const blocked = isMovieBlocked({ override, guide })
  const fromLibrary = libraryKindOf({ library, guide, blocked })
  if (fromLibrary) return { kind: fromLibrary, source: KIND_SOURCES.library }
  if (guide) return { kind: allowedKindOf({ kind: guide.kind, blocked, guide }), source: KIND_SOURCES.guide }
  if (hint) return { kind: allowedKindOf({ kind: hint, blocked, guide }), source: KIND_SOURCES.hint }
  return null
}

export const requestKindOf = ({ row = null, hint = null }) => {
  const hinted = kindHintFrom(hint)
  if (!row) return hinted
  if (!hinted || hinted === row.kind || row.source === KIND_SOURCES.override) return row.kind
  const evidence = evidenceOf(row.evidence)
  if (hinted === MOVIE_KIND && isMovieBlocked(evidence)) return row.kind
  if (row.source === KIND_SOURCES.hint) return hinted
  return isBackedHint({ evidence, hinted }) ? hinted : row.kind
}

export const isMovieBlocked = ({ override = null, guide = null }) => override === NOT_MOVIE || Boolean(guide?.sport)

export const guideKindEvidenceOf = ({ airingKinds = [], episodes = false, sport = false }) => {
  const counts = { [MOVIE_KIND]: 0, [SERIES_KIND]: 0, [ONE_OFF_KIND]: 0 }
  for (const kind of airingKinds) {
    if (!TITLE_KINDS.includes(kind)) continue
    counts[sport && kind === MOVIE_KIND ? ONE_OFF_KIND : kind] += 1
  }
  const total = counts[MOVIE_KIND] + counts[SERIES_KIND] + counts[ONE_OFF_KIND]
  if (!total) return null
  return {
    kind: majorityKindOf({ counts, total }),
    seen: TITLE_KINDS.filter((kind) => counts[kind] > 0),
    episodes: Boolean(episodes),
    sport: Boolean(sport),
  }
}

export const isSportOrNewsCategories = (categories = []) => {
  const texts = [...categories].map((category) => String(category ?? '').trim().toLowerCase())
  if (texts.some((text) => FILM_CATEGORIES.has(text))) return false
  return texts.some((text) => SPORT_OR_NEWS_CATEGORIES.has(text))
}

export const guideKindUpdatesOf = ({
  programmes = [],
  airingKindOf,
  categoriesOf = () => [],
  overrideOf = () => null,
  libraryKindsOf = () => [],
}) => {
  const updates = new Map()
  for (const [showKey, airings] of airingsByShowKeyOf(programmes)) {
    const title = airings[0].title
    const guide = guideKindEvidenceOf({
      airingKinds: airings.map(airingKindOf),
      episodes: airings.some(hasEpisodeDetails),
      sport: isSportOrNewsCategories(airings.flatMap((airing) => categoriesOf(airing.title) ?? [])),
    })
    updates.set(showKey, { override: overrideOf(showKey), library: libraryKindsOf(title), guide })
  }
  return updates
}

export const libraryKindUpdatesOf = ({ rows = [], stored = new Map(), overrides = new Map(), groupKeyOf = showKeyOf }) => {
  const groups = new Map()
  for (const row of rows) {
    const groupKey = groupKeyOf(row.title)
    if (!groupKey) continue
    const group = groups.get(groupKey) ?? { kinds: new Set(), showKeys: new Set(), episodic: false }
    if (row.library_kind) group.kinds.add(row.library_kind)
    if (row.recording_id && hasEpisodeDetails(row)) group.episodic = true
    group.showKeys.add(showKeyOf(row.title))
    groups.set(groupKey, group)
  }
  const updates = new Map()
  for (const group of groups.values()) {
    for (const showKey of group.showKeys) {
      updates.set(showKey, {
        override: overrides.get(showKey) ?? null,
        library: TITLE_KINDS.filter((kind) => group.kinds.has(kind)),
        hint: group.episodic ? SERIES_KIND : null,
      })
    }
  }
  for (const [showKey, row] of stored) {
    if (updates.has(showKey)) continue
    const evidence = evidenceOf(row.evidence)
    if (evidence.library.length || evidence.hint) updates.set(showKey, { override: overrides.get(showKey) ?? null, library: [], hint: null })
  }
  return updates
}

export const mergeTitleKinds = ({ stored = new Map(), updates = new Map(), nowMs = Date.now() }) => {
  const rows = []
  const changes = []
  for (const [showKey, partial] of updates) {
    const before = stored.get(showKey) ?? null
    const evidence = evidenceOf({ ...evidenceOf(before?.evidence), ...definedFieldsOf(partial) })
    if (before && sameEvidence(before.evidence, evidence)) continue
    const decided = decideTitleKind(evidence) ?? (before ? UNDECIDED : null)
    if (!decided) continue
    rows.push({ showKey, kind: decided.kind, source: decided.source, evidence, decidedAt: nowMs })
    if (before && before.kind !== decided.kind) changes.push({ showKey, from: before.kind, to: decided.kind })
  }
  return { rows, changes }
}

export const withTitleKinds = ({ records = new Map(), titleKinds = new Map() }) => {
  const merged = new Map(records)
  for (const [showKey, titleKind] of titleKinds) {
    merged.set(showKey, { genreTags: [], genres: [], source: null, ...merged.get(showKey), titleKind })
  }
  return merged
}

export const loadTitleKinds = async ({ database = db } = {}) => new Map(
  (await database('title_kinds').select('show_key', 'kind', 'source', 'evidence_json', 'decided_at')).map((row) => [row.show_key, titleKindOfRow(row)]),
)

export const loadGuideCategories = async ({ fromMs, toMs, database = db }) => {
  const rows = await database('programme_categories').whereBetween('start_ms', [fromMs, toMs]).distinct('title_key', 'category')
  const byTitle = new Map()
  for (const row of rows) {
    if (!byTitle.has(row.title_key)) byTitle.set(row.title_key, [])
    byTitle.get(row.title_key).push(row.category)
  }
  return byTitle
}

export const createTitleKindStore = ({ database = db, now = Date.now, onChange = () => {} } = {}) => {
  let rows = null
  let loading = null
  let writes = Promise.resolve()

  const ready = async () => {
    if (rows) return rows
    loading ??= loadTitleKinds({ database })
      .catch(() => new Map())
      .then((loaded) => { rows = loaded })
      .finally(() => { loading = null })
    await loading
    return rows
  }

  const all = async () => ready()

  const rowFor = async (title) => (await ready()).get(showKeyOf(title)) ?? null

  const update = (updates) => {
    const run = writes.then(() => applyUpdates(updates))
    writes = run.catch(() => {})
    return run
  }

  const applyUpdates = async (updates) => {
    const stored = await ready()
    const { rows: changed, changes } = mergeTitleKinds({ stored, updates, nowMs: now() })
    if (!changed.length) return changes
    await saveTitleKindRows({ database, rows: changed })
    for (const row of changed) stored.set(row.showKey, row)
    if (changes.length) await Promise.resolve().then(() => onChange(changes)).catch(() => {})
    return changes
  }

  return { all, rowFor, update }
}

const saveTitleKindRows = async ({ database, rows }) => {
  await database.transaction(async (trx) => {
    for (let at = 0; at < rows.length; at += WRITE_BATCH) {
      await trx('title_kinds')
        .insert(rows.slice(at, at + WRITE_BATCH).map(databaseRowOf))
        .onConflict('show_key')
        .merge()
    }
  })
}

const databaseRowOf = (row) => ({
  show_key: row.showKey,
  kind: row.kind,
  source: row.source,
  evidence_json: JSON.stringify(row.evidence),
  decided_at: row.decidedAt,
})

const titleKindOfRow = (row) => ({
  showKey: row.show_key,
  kind: row.kind,
  source: row.source,
  evidence: evidenceOf(parseJson(row.evidence_json)),
  decidedAt: Number(row.decided_at) || 0,
})

const evidenceOf = (evidence) => ({
  override: KIND_OVERRIDES.includes(evidence?.override) ? evidence.override : null,
  library: TITLE_KINDS.filter((kind) => (evidence?.library ?? []).includes(kind)),
  guide: guideOf(evidence?.guide),
  hint: kindHintFrom(evidence?.hint),
})

const guideOf = (guide) => (TITLE_KINDS.includes(guide?.kind)
  ? {
      kind: guide.kind,
      seen: TITLE_KINDS.filter((kind) => (guide.seen ?? []).includes(kind)),
      episodes: Boolean(guide.episodes),
      sport: Boolean(guide.sport),
    }
  : null)

const libraryKindOf = ({ library, guide, blocked }) => {
  if (library.length !== 1) return null
  const [kind] = library
  return kind === MOVIE_KIND && (blocked || guide?.episodes) ? null : kind
}

const allowedKindOf = ({ kind, blocked, guide }) => {
  if (kind !== MOVIE_KIND || !blocked) return kind
  return guide?.sport ? ONE_OFF_KIND : SERIES_KIND
}

const isBackedHint = ({ evidence, hinted }) => evidence.library.includes(hinted)
  || (hinted === MOVIE_KIND && Boolean(evidence.guide?.seen.includes(MOVIE_KIND)))

const majorityKindOf = ({ counts, total }) => {
  if (counts[MOVIE_KIND] === total) return MOVIE_KIND
  return counts[SERIES_KIND] >= counts[ONE_OFF_KIND] ? SERIES_KIND : ONE_OFF_KIND
}

const airingsByShowKeyOf = (programmes) => {
  const groups = new Map()
  for (const programme of programmes) {
    if (!programme?.title) continue
    const key = showKeyOf(programme.title)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(programme)
  }
  return groups
}


const definedFieldsOf = (partial = {}) => Object.fromEntries(Object.entries(partial).filter(([, value]) => value !== undefined))

const sameEvidence = (a, b) => JSON.stringify(evidenceOf(a)) === JSON.stringify(evidenceOf(b))

const parseJson = (json) => {
  try {
    return JSON.parse(json || '{}')
  } catch {
    return {}
  }
}

const OVERRIDE_KINDS = { [MOVIE]: MOVIE_KIND, [SHOW_KIND]: SERIES_KIND, [ONE_OFF_OVERRIDE]: ONE_OFF_KIND }
const SPORT_OR_NEWS_CATEGORIES = new Set([
  'sport',
  'sports',
  'other sport',
  'sports other',
  'news',
  'news/current affairs',
  'news & current affairs',
  'current affairs',
])
const FILM_CATEGORIES = new Set(['movie', 'movies', 'film'])
const WRITE_BATCH = 200
const UNDECIDED = { kind: SERIES_KIND, source: KIND_SOURCES.hint }
