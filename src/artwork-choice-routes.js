import express from 'express'

import { contentKeyOf } from './art-pool.js'
import {
  PLEX_ORIGIN_PREFIX,
  RECORDING_ORIGIN_PREFIX,
  artworkChoiceKindFrom,
  artworkChoices,
  choiceStampOf,
  isCandidateId,
  isShowKey,
} from './artwork-choices.js'
import {
  MAX_UPLOADS_PER_KIND,
  MAX_UPLOAD_BYTES,
  UploadRejected,
  artworkUploads,
  prepareUpload,
} from './artwork-uploads.js'
import { artworkOriginImage, automaticShowSources } from './epg.js'
import { storedTmdbKey } from './fallback-artwork.js'
import { PROGRAMME_IMAGE_WIDTHS, thumbnailWidthFrom } from './image-thumbnails.js'
import { kindOf } from './library.js'
import { getPlexConnection } from './plex.js'

export const mountArtworkChoiceRoutes = ({
  app,
  csrf,
  readLimiter,
  writeLimiter,
  artPool,
  candidates = createArtworkCandidates({ showSources: (key) => artPool.showSources(key) }),
  choices = artworkChoices,
  loadImage = artworkOriginImage,
  uploads = artworkUploads,
  prepare = prepareUpload,
}) => {
  const showKeyFrom = (req, res) => {
    if (isShowKey(req.params.key)) return req.params.key
    res.status(400).json({ error: 'key must be a show key' })
    return null
  }

  const kindFrom = (req, res) => {
    const kind = artworkChoiceKindFrom(req.params.kind)
    if (!kind) res.status(400).json({ error: 'kind must be background or poster' })
    return kind
  }

  const offeredFor = async (key) => {
    const found = await candidates.candidatesFor(key)
    if (!found) return null
    const uploaded = (await uploads.list({ key }).catch(() => [])).map(withIdOf)
    const offered = withChosenOf({ candidates: [...uploaded, ...found.candidates], chosen: await choices.choicesFor(key) })
    return { ...found, offered }
  }

  const uploadTargetFrom = (req, res, next) => {
    if (!showKeyFrom(req, res)) return
    if (!kindFrom(req, res)) return
    next()
  }

  const stampedResponseOf = ({ kind, chosen }) => ({
    kind,
    chosen: chosen ? candidateIdOf({ kind, origin: chosen.origin }) : null,
    stamp: choiceStampOf(chosen),
  })

  app.get('/api/library/artwork-stamps', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ stamps: Object.fromEntries(await choices.stampsByKey().catch(() => new Map())) })
  })

  app.get('/api/library/shows/:key/artwork-candidates', readLimiter, async (req, res) => {
    const key = showKeyFrom(req, res)
    if (!key) return
    res.setHeader('Cache-Control', 'no-store')
    const found = await offeredFor(key)
    if (!found) return res.status(404).json({ error: 'show not found' })
    res.json(candidatesResponseOf({ key, found, chosen: await choices.choicesFor(key) }))
  })

  app.get('/api/library/shows/:key/artwork-candidates/:id', async (req, res) => {
    const key = showKeyFrom(req, res)
    if (!key) return
    if (!isCandidateId(req.params.id)) return res.status(400).json({ error: 'id must be a candidate id' })
    const width = thumbnailWidthFrom({ requested: req.query.w, allowed: PROGRAMME_IMAGE_WIDTHS })
    if (width === null) return res.status(400).json({ error: `w must be one of ${PROGRAMME_IMAGE_WIDTHS.join(', ')}` })
    try {
      const candidate = (await offeredFor(key))?.offered.find((entry) => entry.id === req.params.id)
      const image = candidate && await loadImage({ origin: candidate.origin, kind: candidate.kind, width })
      if (!image) return sendMissingImage(res)
      res.setHeader('Content-Type', image.contentType)
      res.setHeader('Cache-Control', `public, max-age=${IMAGE_MAX_AGE_S}`)
      res.send(image.body)
    } catch {
      sendMissingImage(res)
    }
  })

  app.put('/api/library/shows/:key/artwork/:kind', writeLimiter, csrf, async (req, res) => {
    const key = showKeyFrom(req, res)
    if (!key) return
    const kind = kindFrom(req, res)
    if (!kind) return
    const id = req.body?.id
    if (!isCandidateId(id)) return res.status(400).json({ error: 'id must be a candidate id' })
    const found = await offeredFor(key)
    if (!found) return res.status(404).json({ error: 'show not found' })
    const candidate = found.offered.find((entry) => entry.id === id && entry.kind === kind)
    if (!candidate) return res.status(404).json({ error: 'that picture is not offered for this show' })
    const choice = await choices.choose({ key, kind, origin: candidate.origin, source: candidate.source })
    res.json({ ok: true, kind, chosen: id, stamp: choiceStampOf(choice) })
  })

  app.delete('/api/library/shows/:key/artwork/:kind', writeLimiter, csrf, async (req, res) => {
    const key = showKeyFrom(req, res)
    if (!key) return
    const kind = kindFrom(req, res)
    if (!kind) return
    const removed = await choices.clear({ key, kind })
    res.json({ ok: true, kind, chosen: null, stamp: null, removed: removed ? candidateIdOf({ kind, origin: removed.origin }) : null })
  })

  app.post('/api/library/shows/:key/artwork/:kind/uploads', writeLimiter, csrf, uploadTargetFrom, uploadBody, async (req, res) => {
    const { key, kind } = req.params
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'send the picture as the request body' })
    const found = await offeredFor(key)
    if (!found) return res.status(404).json({ error: 'show not found' })
    if ((await uploads.list({ key, kind })).length >= MAX_UPLOADS_PER_KIND) {
      return res.status(409).json({ error: `remove a picture first: each show keeps up to ${MAX_UPLOADS_PER_KIND}` })
    }
    try {
      const saved = await uploads.save({ key, kind, body: await prepare({ body: req.body, kind }) })
      const choice = await choices.choose({ key, kind, origin: saved.origin, source: saved.source })
      const candidate = withIdOf(saved)
      res.status(201).json({
        ok: true,
        ...stampedResponseOf({ kind, chosen: choice }),
        candidate: candidateEntryOf({ key, entry: candidate }),
      })
    } catch (err) {
      if (err instanceof UploadRejected) return res.status(415).json({ error: err.message })
      res.status(500).json({ error: 'cannot save the picture' })
    }
  })

  app.delete('/api/library/shows/:key/artwork/:kind/uploads/:id', writeLimiter, csrf, uploadTargetFrom, async (req, res) => {
    const { key, kind, id } = req.params
    if (!isCandidateId(id)) return res.status(400).json({ error: 'id must be a candidate id' })
    const upload = (await uploads.list({ key, kind })).find((entry) => candidateIdOf(entry) === id)
    if (!upload) return res.status(404).json({ error: 'that picture is not one of your uploads' })
    const chosen = await choices.chosenFor({ key, kind })
    const wasChosen = chosen?.origin === upload.origin
    if (wasChosen) await choices.clear({ key, kind })
    await uploads.remove(upload.origin)
    res.json({ ok: true, removed: id, ...stampedResponseOf({ kind, chosen: wasChosen ? null : chosen }) })
  })
}

const uploadParser = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES })

const uploadBody = (req, res, next) => uploadParser(req, res, (err) => {
  if (!err) return next()
  if (err.status === 413) return res.status(413).json({ error: 'the picture must be 20 MB or smaller' })
  res.status(400).json({ error: 'cannot read the upload' })
})

export const createArtworkCandidates = ({
  showSources,
  automaticSources = automaticShowSources,
  plexUrl = async () => (await getPlexConnection().catch(() => null))?.url ?? null,
  hasTmdbKey = async () => Boolean(await storedTmdbKey()),
  now = Date.now,
  ttlMs = CANDIDATES_TTL_MS,
  budgetMs = LOOKUP_BUDGET_MS,
  maxEntries = MAX_MEMO_ENTRIES,
}) => {
  const memo = new Map()
  const inflight = new Map()

  const gather = async (key) => {
    const sources = await withinMs(Promise.resolve(showSources(key)).catch(() => null), budgetMs)
    if (sources === TIMED_OUT) return { title: null, candidates: [], tmdbKey: false, pending: true }
    if (!sources) return null
    const filmKind = kindOf({ rows: sources.rows }) === 'movie' ? 'movie' : null
    const [automatic, url, tmdbKey] = await Promise.all([
      withinMs(Promise.resolve(automaticSources({ title: sources.title, kind: filmKind })).catch(() => EMPTY_AUTOMATIC), budgetMs),
      plexUrl().catch(() => null),
      hasTmdbKey().catch(() => false),
    ])
    const pending = automatic === TIMED_OUT
    return {
      title: sources.title,
      tmdbKey,
      pending,
      candidates: artworkCandidatesOf({
        rows: sources.rows,
        plex: sources.plex?.entries || [],
        tvmaze: sources.tvmaze || [],
        automatic: pending ? EMPTY_AUTOMATIC : automatic,
        plexUrl: url,
      }),
    }
  }

  const remember = (key, value) => {
    memo.set(key, { value, expiresAt: now() + ttlMs })
    if (memo.size > maxEntries) memo.delete(memo.keys().next().value)
  }

  const candidatesFor = async (key) => {
    const cached = memo.get(key)
    if (cached && cached.expiresAt > now()) return cached.value
    if (inflight.has(key)) return inflight.get(key)
    const pending = gather(key)
      .then((value) => {
        if (value && !value.pending) remember(key, value)
        return value
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, pending)
    return pending
  }

  return { candidatesFor }
}

export const artworkCandidatesOf = ({ rows = [], plex = [], tvmaze = [], automatic = EMPTY_AUTOMATIC, plexUrl = null }) => {
  const plexArts = plex
    .filter((entry) => entry.kind === 'background' && entry.origin)
    .map((entry) => ({ origin: entry.origin, kind: 'background' }))
  const plexListed = automatic.library
    .map((source) => plexEntryOf({ source, plexUrl }))
    .filter((entry) => entry && (entry.kind === 'poster' || !plexArts.length))
  const fromPlex = [...plexArts, ...plexListed].map((entry) => ({ ...entry, source: 'plex' }))
  const fromTvmaze = tvmaze
    .filter((entry) => ['background', 'poster'].includes(entry.kind) && entry.origin)
    .map((entry) => ({ origin: entry.origin, kind: entry.kind, source: 'tvmaze' }))
  const fromFallback = automatic.fallback.flatMap(fallbackEntriesOf)
  const fromGuide = [...guideEntriesOf(rows), ...upcomingGuideEntriesOf(automatic.guide)]
  return uniqueById([...fromPlex, ...fromTvmaze, ...fromFallback, ...fromGuide].map(withIdOf))
    .filter(perSourceLimit())
}

export const withChosenOf = ({ candidates, chosen = {} }) => {
  const extra = Object.entries(chosen)
    .map(([kind, choice]) => withIdOf({ origin: choice.origin, kind, source: choice.source }))
    .filter((entry) => !candidates.some((candidate) => candidate.id === entry.id))
  return [...candidates, ...extra]
}

export const candidatesResponseOf = ({ key, found, chosen = {} }) => ({
  title: found.title,
  tmdbKey: Boolean(found.tmdbKey),
  pending: Boolean(found.pending),
  chosen: {
    background: chosen.background ? candidateIdOf({ kind: 'background', origin: chosen.background.origin }) : null,
    poster: chosen.poster ? candidateIdOf({ kind: 'poster', origin: chosen.poster.origin }) : null,
  },
  candidates: found.offered.map((entry) => candidateEntryOf({ key, entry })),
})

const candidateEntryOf = ({ key, entry }) => ({
  id: entry.id,
  kind: entry.kind,
  source: entry.source,
  caption: entry.caption ?? null,
  url: `/api/library/shows/${encodeURIComponent(key)}/artwork-candidates/${entry.id}?w=${TILE_WIDTH}`,
})

export const candidateIdOf = ({ kind, origin }) => contentKeyOf(`${kind}|${origin}`)

export const plexEntryOf = ({ source, plexUrl }) => {
  if (!plexUrl || !String(source).startsWith(`${plexUrl}/`)) return null
  const [path, query = ''] = String(source).slice(plexUrl.length).split('?')
  const params = new URLSearchParams(query)
  params.delete('X-Plex-Token')
  const rest = params.toString()
  const kind = plexPathKindOf(path)
  return kind ? { origin: `${PLEX_ORIGIN_PREFIX}${path}${rest ? `?${rest}` : ''}`, kind } : null
}

const plexPathKindOf = (path) => {
  if (/\/thumb(\/|$)/.test(path)) return 'poster'
  if (/\/art(\/|$)/.test(path)) return 'background'
  return null
}

const fallbackEntriesOf = (source) => {
  const host = hostOf(source)
  if (host === 'image.tmdb.org') {
    if (source.includes('/w1280/')) return [{ origin: source, kind: 'background', source: 'tmdb' }]
    if (source.includes('/w780/')) return [{ origin: source, kind: 'poster', source: 'tmdb' }]
    return []
  }
  if (host === 'upload.wikimedia.org') {
    return ['background', 'poster'].map((kind) => ({ origin: source, kind, source: 'wikipedia' }))
  }
  return []
}

const guideEntriesOf = (rows) => [...rows]
  .filter((row) => row.image_path && row.recording_id)
  .sort((a, b) => Number(b.aired_at ?? 0) - Number(a.aired_at ?? 0))
  .slice(0, MAX_GUIDE_PICTURES)
  .map((row) => ({
    origin: `${RECORDING_ORIGIN_PREFIX}${row.recording_id}`,
    kind: 'background',
    source: 'guide',
    caption: [row.episode != null ? `E${row.episode}` : null, row.episode_title].filter(Boolean).join(' · ') || null,
  }))

const upcomingGuideEntriesOf = (sources = []) => sources
  .slice(0, MAX_GUIDE_PICTURES)
  .map((source) => ({ origin: source, kind: 'background', source: 'guide' }))

const withIdOf = (entry) => ({ ...entry, id: candidateIdOf(entry) })

const uniqueById = (entries) => {
  const seen = new Set()
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

const perSourceLimit = () => {
  const counts = new Map()
  return (entry) => {
    const key = `${entry.source}|${entry.kind}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    return counts.get(key) <= MAX_PER_SOURCE
  }
}

const hostOf = (source) => {
  try {
    return new URL(source).hostname
  } catch {
    return ''
  }
}

const withinMs = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(resolve, ms, TIMED_OUT).unref?.()),
])

const sendMissingImage = (res) => {
  res.setHeader('Cache-Control', `public, max-age=${MISSING_IMAGE_MAX_AGE_S}`)
  res.status(404).end()
}

const TIMED_OUT = Symbol('timed out')
const EMPTY_AUTOMATIC = { library: [], fallback: [], guide: [] }
const TILE_WIDTH = 384
const MAX_PER_SOURCE = 12
const MAX_GUIDE_PICTURES = 6
const MAX_MEMO_ENTRIES = 200
const CANDIDATES_TTL_MS = 10 * 60 * 1000
const LOOKUP_BUDGET_MS = 6000
const IMAGE_MAX_AGE_S = 24 * 60 * 60
const MISSING_IMAGE_MAX_AGE_S = 5 * 60
