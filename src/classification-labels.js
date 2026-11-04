import { db as defaultDb } from './db.js'
import { timeshiftHours } from './tvheadend-guide.js'

export const CLASSIFICATIONS = ['G', 'PG', 'M', 'MA15+', 'R18+', 'P', 'C', 'AV15+']

export const normaliseClassification = (value) => {
  const compact = String(value ?? '').toUpperCase().replace(/\s+/g, '')
  const label = MISSING_PLUS.test(compact) ? `${compact}+` : compact
  return CLASSIFICATIONS.includes(label) ? label : null
}

export const classificationFromAgeRating = (ageRating) => AGE_RATING_LABELS.get(Number(ageRating)) ?? null

export const classificationOfProgramme = (programmeXml) => {
  const ratings = [...String(programmeXml).matchAll(RATING_ELEMENT)]
    .map(([, attributes, body]) => ({
      system: attributes.match(SYSTEM_ATTRIBUTE)?.[1] ?? '',
      label: normaliseClassification(decodeEntities(body.match(VALUE_ELEMENT)?.[1] ?? '')),
    }))
    .filter((rating) => rating.label)
  return (ratings.find((rating) => isAustralianSystem(rating.system)) ?? ratings[0])?.label ?? null
}

export const classificationTitleKey = (title) => String(title ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

export const classificationKeyOf = ({ title, startMs, shiftHours = 0 }) => (shiftHours
  ? `${classificationTitleKey(title)}|${Number(startMs)}|+${shiftHours}`
  : `${classificationTitleKey(title)}|${Number(startMs)}`)

export const channelShiftHours = (channelName) => timeshiftHours(channelName ?? '')

export const shiftHoursByChannelOf = (channels = []) => {
  const names = new Map()
  for (const channel of channels) {
    for (const id of [channel.epgId, channel.id]) if (id != null) names.set(String(id), channel.name)
  }
  return (programme) => channelShiftHours(programme?.channelName ?? names.get(String(programme?.channel_id ?? programme?.channelId)))
}

export const fallbackClassification = ({ rating, ratingLabel } = {}) =>
  normaliseClassification(ratingLabel) ?? classificationFromAgeRating(rating)

export const categoryOfProgramme = (programmeXml) => {
  const category = String(programmeXml).match(CATEGORY_ELEMENT)?.[1]
  return category ? decodeEntities(category).trim().toLowerCase() || null : null
}

export const isRatingsLikely = ({ kind, category }) => kind === FILM_KIND || RATED_CATEGORIES.has(category)

export const programmeClassificationEntry = ({ programmeXml, parseTime }) => {
  const label = programmeXml.includes('<rating') ? classificationOfProgramme(programmeXml) : null
  const category = programmeXml.includes('<category') ? categoryOfProgramme(programmeXml) : null
  if (!label && !category) return null
  const title = programmeXml.match(TITLE_ELEMENT)?.[1]
  const startMs = parseTime(programmeXml.match(START_ATTRIBUTE)?.[1])
  if (!title || startMs === null) return null
  return { titleKey: classificationTitleKey(decodeEntities(title)), startMs, shiftHours: 0, label, category }
}

export const createClassificationStore = ({ db = defaultDb, keepMs = KEEP_PAST_MS } = {}) => {
  let writes = Promise.resolve()
  const saveRows = async ({ table, rows }) => {
    for (let i = 0; i < rows.length; i += WRITE_BATCH) {
      await db(table)
        .insert(rows.slice(i, i + WRITE_BATCH))
        .onConflict(['title_key', 'start_ms', 'shift_hours'])
        .merge()
    }
  }
  const save = async (entries) => {
    await saveRows({ table: 'programme_classifications', rows: entries.filter((entry) => entry.label).map(toRow) })
    await saveRows({ table: 'programme_categories', rows: entries.filter((entry) => entry.category).map(toCategoryRow) })
  }
  const categoriesAt = async (startTimes) => {
    const starts = [...new Set(startTimes.map(Number).filter(Number.isFinite))]
    if (!starts.length) return new Map()
    const query = db('programme_categories').select('title_key', 'start_ms', 'shift_hours', 'category')
    const rows = starts.length > MAX_LISTED_STARTS
      ? await query.whereBetween('start_ms', [Math.min(...starts), Math.max(...starts)])
      : await query.whereIn('start_ms', starts)
    return new Map(rows.map((row) => [rowKeyOf(row), row.category]))
  }
  const queue = (work) => {
    writes = writes.then(work).catch((err) => console.warn(`[classification] could not save labels: ${err.message}`))
    return writes
  }
  const labelsAt = async (startTimes) => {
    const starts = [...new Set(startTimes.map(Number).filter(Number.isFinite))]
    if (!starts.length) return new Map()
    const query = db('programme_classifications').select('title_key', 'start_ms', 'shift_hours', 'label')
    const rows = starts.length > MAX_LISTED_STARTS
      ? await query.whereBetween('start_ms', [Math.min(...starts), Math.max(...starts)])
      : await query.whereIn('start_ms', starts)
    return new Map(rows.map((row) => [rowKeyOf(row), row.label]))
  }
  const copyToRecordings = async () => {
    const recordings = await db('recordings')
      .whereNull('classification')
      .whereNotNull('aired_at')
      .select('recording_id', 'title', 'aired_at', 'channel_name')
    const labels = await labelsAt(recordings.map((row) => row.aired_at))
    const idsByLabel = groupIdsByLabel({ recordings, labels })
    for (const [label, ids] of idsByLabel) {
      for (let i = 0; i < ids.length; i += WRITE_BATCH) {
        await db('recordings').whereIn('recording_id', ids.slice(i, i + WRITE_BATCH)).update({ classification: label })
      }
    }
    return [...idsByLabel.values()].reduce((count, ids) => count + ids.length, 0)
  }
  const keepForRecordings = () => copyToRecordings()
    .catch((err) => console.warn(`[classification] could not copy labels to recordings: ${err.message}`))
  return {
    record: (entries) => (entries.length ? queue(() => save(entries)) : writes),
    prune: ({ nowMs = Date.now() } = {}) => queue(async () => {
      await keepForRecordings()
      await db('programme_classifications').where('start_ms', '<', nowMs - keepMs).delete()
      await db('programme_categories').where('start_ms', '<', nowMs - keepMs).delete()
    }),
    copyToRecordings,
    labelsAt,
    categoriesAt,
    categoryAt: async ({ title, startMs, shiftHours = 0 }) => {
      const row = await db('programme_categories')
        .where({ title_key: classificationTitleKey(title), start_ms: startMs, shift_hours: shiftHours })
        .first('category')
      return row?.category ?? null
    },
    settled: () => writes,
    lookup: async ({ title, startMs, shiftHours = 0 }) => {
      const row = await db('programme_classifications')
        .where({ title_key: classificationTitleKey(title), start_ms: startMs, shift_hours: shiftHours })
        .first('label')
      return row?.label ?? null
    },
  }
}

export const createClassificationRecorder = ({ store, batchSize = RECORD_BATCH, now = Date.now }) => {
  let buffered = []
  const send = () => {
    store.record(buffered)
    buffered = []
  }
  return {
    add: (entries) => {
      buffered.push(...entries)
      if (buffered.length >= batchSize) send()
    },
    finish: () => {
      send()
      store.prune({ nowMs: now() })
    },
  }
}

export const programmeClassification = async ({ programme, store, channels = [] }) => {
  if (!programme) return null
  const shiftHours = shiftHoursByChannelOf(channels)(programme)
  const label = await store.lookup({ title: programme.title, startMs: programme.start, shiftHours }).catch(() => null)
  return label ?? classificationFromAgeRating(programme.rating)
}

export const createClassificationLookup = async ({ programmes, store, channels = [] }) => {
  const labels = await store.labelsAt(programmes.map((programme) => programme.start)).catch(() => new Map())
  const shiftHoursOf = shiftHoursByChannelOf(channels)
  return (programme) => labels.get(classificationKeyOf({ title: programme.title, startMs: programme.start, shiftHours: shiftHoursOf(programme) }))
    ?? fallbackClassification(programme)
}

const groupIdsByLabel = ({ recordings, labels }) => {
  const idsByLabel = new Map()
  for (const row of recordings) {
    const label = labels.get(classificationKeyOf({ title: row.title, startMs: row.aired_at, shiftHours: channelShiftHours(row.channel_name) }))
    if (label) idsByLabel.set(label, [...(idsByLabel.get(label) || []), row.recording_id])
  }
  return idsByLabel
}

const toRow = ({ titleKey, startMs, shiftHours = 0, label }) => ({ title_key: titleKey, start_ms: startMs, shift_hours: shiftHours, label })

const toCategoryRow = ({ titleKey, startMs, shiftHours = 0, category }) => ({ title_key: titleKey, start_ms: startMs, shift_hours: shiftHours, category })

const rowKeyOf = (row) => classificationKeyOf({ title: row.title_key, startMs: row.start_ms, shiftHours: Number(row.shift_hours) || 0 })

const isAustralianSystem = (system) => !system || AUSTRALIAN_SYSTEM.test(system)

const decodeEntities = (value) => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (all, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (all, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&amp;/g, '&')

const FILM_KIND = 'movie'
const CATEGORY_ELEMENT = /<category\b[^>]*>([^<]*)<\/category>/
const RATED_CATEGORIES = new Set([
  'drama', 'comedy', 'crime', 'documentary', 'movies', 'movie', 'film', 'action & adventure', 'action', 'adventure',
  'horror', 'thriller', 'mystery', 'sci-fi', 'science fiction', 'fantasy', 'animation', 'romance', 'war', 'western',
  'history', 'nature', 'science', 'factual', 'biography', 'musical', 'family',
])
const AGE_RATING_LABELS = new Map([[15, 'MA15+'], [18, 'R18+']])
const MISSING_PLUS = /^(?:MA15|AV15|R18)$/
const RATING_ELEMENT = /<rating\b([^>]*)>([\s\S]*?)<\/rating>/g
const SYSTEM_ATTRIBUTE = /\bsystem="([^"]*)"/
const VALUE_ELEMENT = /<value>([^<]*)<\/value>/
const TITLE_ELEMENT = /<title\b[^>]*>([^<]*)<\/title>/
const START_ATTRIBUTE = /^<programme\b[^>]*?\bstart="([^"]*)"/
const AUSTRALIAN_SYSTEM = /^(?:AU|AUS|ACMA|Australia)/i
const KEEP_PAST_MS = 3 * 24 * 60 * 60_000
const WRITE_BATCH = 300
const RECORD_BATCH = 500
const MAX_LISTED_STARTS = 500
