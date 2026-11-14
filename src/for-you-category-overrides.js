import { db } from './db.js'
import { OTHER_SPORT, OTHER_SPORT_TITLE, SPORT_FORMAT, countryNameOf, formatGroupTitleOf } from './for-you-category-catalogue.js'
import { MAX_TOPICS, createCategoryIndex, recordFactsOf, tagTitle } from './for-you-categories.js'
import { knownShowOf } from './for-you-known-shows.js'
import { createKeyResolver } from './for-you-profile.js'
import { showKeyOf } from './web/show-key.js'
import { MOVIE, showKeyFrom } from './programme-kind.js'

export const loadCategoryOverrides = async () => new Map(
  (await db(TABLE).select('show_key', 'format', 'topics_json')).map((row) => [row.show_key, overrideOfRow(row)]),
)

export const withCategoryOverrides = ({ records, overrides }) => {
  const merged = new Map(records)
  for (const [key, categoryOverride] of overrides) {
    merged.set(key, { genreTags: [], genres: [], source: null, ...merged.get(key), categoryOverride })
  }
  return merged
}

export const overrideChoicesOf = (index) => {
  const groups = [...index.groups.values()]
  return {
    formats: groups.filter((info) => info.slot === 'format').map(choiceOf),
    topics: groups.filter((info) => info.slot === 'topic' && (info.row === 'category' || info.row === 'facet')).map(choiceOf),
    sports: groups.filter((info) => info.row === 'sport').map(sportChoiceOf),
  }
}

export const categoryOverrideFrom = ({ body, index }) => {
  const choices = overrideChoicesOf(index)
  const formats = new Set(choices.formats.map((choice) => choice.key))
  const topicKeys = new Set(choices.topics.map((choice) => choice.key))
  const format = body?.format ?? null
  if (format !== null && !formats.has(format)) return { error: 'format must be a format key or null' }
  const sport = body?.sport ?? null
  if (format === SPORT_FORMAT) return sportOverrideFrom({ body, sport, choices })
  if (sport !== null) return { error: `sport needs the format ${SPORT_FORMAT}` }
  const topics = body?.topics ?? []
  if (!Array.isArray(topics) || topics.some((topic) => !topicKeys.has(topic))) return { error: 'topics must list topic keys' }
  const unique = [...new Set(topics)]
  if (unique.length > MAX_TOPICS) return { error: `topics must list at most ${MAX_TOPICS} keys` }
  if (!format && !unique.length) return { error: 'Choose a format or a topic' }
  return { override: { format, topics: unique } }
}

export const showCategoriesOf = ({ showKey, title = '', index, override = null, tasteTitle = null, record = null, kindOverride = null }) => {
  const labels = override ?? labelsOfTaste({ tasteTitle, index }) ?? automaticLabelsOf({ showKey, title, index, record, kindOverride })
  return {
    showKey,
    custom: Boolean(override),
    format: labels.format,
    topics: labels.topics,
    sport: labels.sport ?? null,
    origin: originOf({ showKey, index, record }),
    choices: overrideChoicesOf(index),
  }
}

export const resolvedShowKeyOf = ({ showKey, title = '', knownKeys = new Set() }) => {
  if (!title) return showKey
  return showKeyFrom(createKeyResolver(new Set(knownKeys))(title)) ?? showKey
}

export const mountCategoryOverrideRoutes = ({ app, csrf, limiter = passThrough, onChange = () => {}, country = () => '', tasteTitleOf = async () => null, knownKeysOf = async () => new Set() }) => {
  const payloadOf = async ({ showKey, title }) => {
    const kindKeys = [...new Set([showKey, title ? showKeyOf(title) : showKey])]
    const index = createCategoryIndex({ country: country() })
    const [row, record, tasteTitle, kind] = await Promise.all([
      db(TABLE).where({ show_key: showKey }).first(),
      db('title_genres').where({ title_key: showKey }).first().catch(() => null),
      tasteTitleOf(showKey).catch(() => null),
      db('programme_kind_overrides').whereIn('show_key', kindKeys).first().catch(() => null),
    ])
    return showCategoriesOf({ showKey, title, index, override: row ? overrideOfRow(row) : null, tasteTitle, record: record ? recordOfRow(record) : null, kindOverride: kind?.kind ?? null })
  }

  const keyFrom = async ({ raw, title }) => {
    const showKey = showKeyFrom(raw)
    if (!showKey) return null
    return resolvedShowKeyOf({ showKey, title, knownKeys: await knownKeysOf().catch(() => new Set()) })
  }

  app.get(`${ROUTE}/:showKey`, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const title = titleOf(req.query.title)
    const showKey = await keyFrom({ raw: req.params.showKey, title })
    if (!showKey) return res.status(400).json({ error: SHOW_KEY_ERROR })
    try {
      res.json(await payloadOf({ showKey, title }))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.put(`${ROUTE}/:showKey`, limiter, csrf, async (req, res) => {
    const title = titleOf(req.body?.title)
    const showKey = await keyFrom({ raw: req.params.showKey, title })
    if (!showKey) return res.status(400).json({ error: SHOW_KEY_ERROR })
    const { override, error } = categoryOverrideFrom({ body: req.body, index: createCategoryIndex({ country: country() }) })
    if (error) return res.status(400).json({ error })
    try {
      await db(TABLE)
        .insert({ show_key: showKey, format: override.format, topics_json: storedLabelsOf(override), updated_at: Date.now() })
        .onConflict('show_key')
        .merge(['format', 'topics_json', 'updated_at'])
      onChange()
      res.json(await payloadOf({ showKey, title }))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.delete(`${ROUTE}/:showKey`, limiter, csrf, async (req, res) => {
    const title = titleOf(req.query.title)
    const showKey = await keyFrom({ raw: req.params.showKey, title })
    if (!showKey) return res.status(400).json({ error: SHOW_KEY_ERROR })
    try {
      const removed = await db(TABLE).where({ show_key: showKey }).delete()
      if (removed) onChange()
      res.json(await payloadOf({ showKey, title }))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
}

const labelsOfTaste = ({ tasteTitle, index }) => {
  if (!tasteTitle?.categories?.length || tasteTitle.custom) return null
  const keys = tasteTitle.categories.map((category) => category.key)
  return labelsOfKeys({ keys, index })
}

const automaticLabelsOf = ({ showKey, title, index, record, kindOverride }) => {
  if (kindOverride === MOVIE) return { format: null, topics: [], sport: null }
  const facts = {
    key: showKey,
    title: title || showKey.replaceAll('-', ' '),
    genreTags: (record?.genreTags || []).filter((tag) => !tag.startsWith('movie')),
    channelNames: [],
    guideGenres: [],
    genre: null,
    ...recordFactsOf(record),
    override: null,
  }
  const tags = tagTitle({ index, facts })
  return labelsOfKeys({ keys: tags.entries.filter((entry) => entry.weight > 0).map((entry) => entry.group), index })
}

const labelsOfKeys = ({ keys, index }) => {
  const sport = keys.find((key) => index.groups.get(key)?.row === 'sport')
  if (sport) return { format: SPORT_FORMAT, topics: [], sport: sport === OTHER_SPORT ? null : sport }
  const choices = overrideChoicesOf(index)
  const topicKeys = new Set(choices.topics.map((choice) => choice.key))
  const formatKeys = new Set(choices.formats.map((choice) => choice.key))
  return {
    format: keys.find((key) => formatKeys.has(key)) ?? null,
    topics: keys.filter((key) => topicKeys.has(key)).slice(0, MAX_TOPICS),
    sport: null,
  }
}

const sportOverrideFrom = ({ body, sport, choices }) => {
  if (Array.isArray(body?.topics) ? body.topics.length : body?.topics != null) return { error: 'sport and topics cannot be sent together' }
  if (!choices.sports.some((choice) => choice.key === sport)) return { error: 'sport must be a sport code' }
  return { override: { format: SPORT_FORMAT, topics: [], sport } }
}

const storedLabelsOf = (override) => JSON.stringify(override.format === SPORT_FORMAT ? { sport: override.sport } : override.topics)

const originOf = ({ showKey, index, record }) => {
  const token = (record?.genres || []).map(String).find((genre) => genre.startsWith('country:'))
  if (token) return originEntryOf({ code: token.slice('country:'.length).toLowerCase(), source: String(record.source || '').startsWith('tvmaze:') ? 'TVmaze' : 'Wikidata' })
  const known = knownShowOf({ keys: [showKey], country: index.country, list: index.knownShows })
  return known?.origin ? originEntryOf({ code: known.origin, source: 'built-in list' }) : null
}

const originEntryOf = ({ code, source }) => {
  const name = countryNameOf(code)
  return name ? { code, name, source } : null
}

const sportChoiceOf = (info) => ({ key: info.group, title: info.group === OTHER_SPORT ? OTHER_SPORT_TITLE : info.title })

const choiceOf = (info) => ({ key: info.group, title: info.title, ...(info.formatGroup && { group: formatGroupTitleOf(info.formatGroup) }) })

const overrideOfRow = (row) => {
  const stored = parsedOf(row.topics_json)
  if (row.format === SPORT_FORMAT && typeof stored?.sport === 'string') return { format: SPORT_FORMAT, topics: [], sport: stored.sport }
  return { format: row.format || null, topics: topicsOf(row.topics_json) }
}

const recordOfRow = (row) => ({ genreTags: listOf(row.categories_json), genres: listOf(row.genres_json), source: row.source || null })

const topicsOf = (json) => listOf(json).map(String).slice(0, MAX_TOPICS)

const listOf = (json) => {
  const value = parsedOf(json)
  return Array.isArray(value) ? value : []
}

const parsedOf = (json) => {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

const titleOf = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_TITLE_LENGTH) : '')

const passThrough = (req, res, next) => next()

const TABLE = 'programme_category_overrides'
const ROUTE = '/api/for-you/categories/show'
const SHOW_KEY_ERROR = 'showKey must be a show key'
const MAX_TITLE_LENGTH = 200
