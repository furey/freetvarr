import { createHash } from 'node:crypto'
import sharp from 'sharp'

import { db } from './db.js'
import { isLandscapeSize } from './image-thumbnails.js'
import { showTitleKey } from './show-artwork.js'
import { POSTER_SHAPE, isPortraitSize } from './show-poster.js'
import { showKeyOf } from './web/show-key.js'

export const MOVIE_KIND = 'movie'
export const SERIES_KIND = 'series'
export const ONE_OFF_KIND = 'one-off'
export const TITLE_KINDS = [MOVIE_KIND, SERIES_KIND, ONE_OFF_KIND]
export const LANDSCAPE_SHAPE = 'landscape'
export const FINAL_STAGE = 'none'

export const TITLE_CHAINS = {
  [MOVIE_KIND]: ['choice', 'plex', 'recording', 'guide', 'online', 'derived', 'frame', 'derived', FINAL_STAGE],
  [SERIES_KIND]: ['choice', 'plex', 'recording', 'guide', 'online', 'derived', 'frame', 'derived', FINAL_STAGE],
  [ONE_OFF_KIND]: ['choice', 'plex', 'recording', 'guide', 'frame', 'online', 'derived', FINAL_STAGE],
}
export const EPISODE_CHAIN = ['episode', 'title', 'frame', FINAL_STAGE]
export const EPISODE_FRAME_FIRST_CHAIN = ['episode', 'frame', 'title', FINAL_STAGE]
export const SERIES_PICTURE_FIRST = 'series'
export const EPISODE_FRAME_FIRST = 'frame'
export const EPISODE_PICTURE_ORDERS = [SERIES_PICTURE_FIRST, EPISODE_FRAME_FIRST]

export const episodePictureOrderFrom = (value) => (value === EPISODE_FRAME_FIRST ? EPISODE_FRAME_FIRST : SERIES_PICTURE_FIRST)
export const GUIDE_ONLY_CHAIN = ['own', 'same-title', 'title', FINAL_STAGE]

export const chainOf = ({ kind, recordingId = null, eventId = null, episodeOrder = SERIES_PICTURE_FIRST }) => {
  if (recordingId != null) return episodeOrder === EPISODE_FRAME_FIRST ? EPISODE_FRAME_FIRST_CHAIN : EPISODE_CHAIN
  if (eventId != null) return GUIDE_ONLY_CHAIN
  return TITLE_CHAINS[kind] ?? TITLE_CHAINS[SERIES_KIND]
}

export const kindHintFrom = (value) => (TITLE_KINDS.includes(value) ? value : null)

export const canonicalKindOf = ({ libraryKinds = [], override = null, guideKind = null, hint = null }) => {
  const hinted = kindHintFrom(hint)
  const notMovie = override === NOT_MOVIE_OVERRIDE
  const fromLibrary = hinted
    ? (libraryKinds.includes(hinted) ? hinted : null)
    : (libraryKinds.length === 1 ? libraryKinds[0] : null)
  const candidates = [
    fromLibrary,
    OVERRIDE_KINDS[override] ?? null,
    guideKind,
    hinted,
    libraryKinds.length === 1 ? libraryKinds[0] : null,
  ]
  return candidates.find((kind) => kind && !(notMovie && kind === MOVIE_KIND)) ?? SERIES_KIND
}

export const guideKindsOf = (programmes = []) => {
  const countsByKey = new Map()
  for (const programme of programmes) {
    const key = showTitleKey(programme?.title)
    if (!key || !TITLE_KINDS.includes(programme.kind)) continue
    const counts = countsByKey.get(key) ?? { [MOVIE_KIND]: 0, [SERIES_KIND]: 0, [ONE_OFF_KIND]: 0 }
    counts[programme.kind] += 1
    countsByKey.set(key, counts)
  }
  return new Map([...countsByKey].map(([key, counts]) => [key, guideKindOfCounts(counts)]))
}

export const resolutionKeyOf = ({ titleKey, kind, shape }) => `${kind}|${shape}|${titleKey}`

export const createArtResolver = ({
  stages = {},
  kindOf = async ({ hint }) => kindHintFrom(hint) ?? SERIES_KIND,
  loadImage,
  sizeOf = imageSizeOf,
  settingsKeyOf = async () => '',
  store = databaseStore,
  now = Date.now,
  budgetMs = RESOLVE_BUDGET_MS,
  outerBudgetMs = OUTER_BUDGET_MS,
  minWidths = MIN_WIDTHS,
  hitRecheckMs = HIT_RECHECK_MS,
  missRetryMs = MISS_RETRY_MS,
  errorRetryMs = ERROR_RETRY_MS,
  onResolved = () => {},
  followUpDelaysMs = FOLLOW_UP_DELAYS_MS,
  followUpBudgetMs = FOLLOW_UP_BUDGET_MS,
}) => {
  const inflight = new Map()
  const followUps = new Map()
  const answeredPending = new Map()

  const resolve = async ({ title, kind: hint = null, shape = null, recordingId = null, eventId = null, ...extra }) => {
    const kind = await kindOf({ title, hint })
    const ctx = {
      ...extra,
      title,
      titleKey: showTitleKey(title),
      kind,
      shape: shape === POSTER_SHAPE ? POSTER_SHAPE : LANDSCAPE_SHAPE,
      recordingId,
      eventId,
    }
    const isTitleRequest = recordingId == null && eventId == null
    const result = isTitleRequest ? await resolveTitle(ctx) : await resolveOuter(ctx)
    return { ...result, kind }
  }

  const resolveTitle = async (ctx) => {
    const result = await resolveTitleOnce({ ctx, budget: budgetMs })
    if (result.pending) followUp({ key: resolutionKeyOf(ctx), run: () => resolveTitleOnce({ ctx, budget: followUpBudgetMs }) })
    return result
  }

  const resolveOuter = async (ctx) => {
    const run = (budget) => settleAnswer({ ctx, key: outerKeyOf(ctx), result: runOuterChain({ chain: chainOf(ctx), ctx, budget }) })
    const result = await run(outerBudgetMs)
    if (result.pending) followUp({ key: outerKeyOf(ctx), run: () => run(followUpBudgetMs) })
    return result
  }

  const resolveTitleOnce = ({ ctx, budget }) =>
    settleAnswer({ ctx, key: resolutionKeyOf(ctx), result: resolveTitleWithin({ ctx, budget }) })

  const settleAnswer = async ({ ctx, key, result }) => {
    const answer = await result
    if (answer.pending) {
      rememberPendingAnswer(key)
      return answer
    }
    if (answeredPending.delete(key) && answer.origin) {
      onResolved({ key: showKeyOf(ctx.title), kind: stampKindOf(ctx.shape), stamp: null })
    }
    return answer
  }

  const rememberPendingAnswer = (key) => {
    answeredPending.delete(key)
    answeredPending.set(key, true)
    if (answeredPending.size > MAX_PENDING_ANSWERS) answeredPending.delete(answeredPending.keys().next().value)
  }

  const followUp = ({ key, run }) => {
    if (followUps.has(key) || !followUpDelaysMs.length) return
    const attempt = (index) => {
      const timer = setTimeout(async () => {
        const result = await run().catch(() => PENDING_RESULT)
        if (result.pending && index + 1 < followUpDelaysMs.length) return attempt(index + 1)
        followUps.delete(key)
      }, followUpDelaysMs[index])
      timer.unref?.()
      followUps.set(key, timer)
    }
    attempt(0)
  }

  const resolveTitleWithin = async ({ ctx, budget }) => {
    if (!ctx.titleKey) return FINAL_RESULT
    const deadline = now() + budget
    const chosen = await stageWithin({ stage: 'choice', ctx, deadline })
    if (chosen.sources[0]) return { stage: 'choice', origin: chosen.sources[0], transform: chosenTransformOf(ctx.shape), pending: false }
    const local = await localEvidenceOf({ ctx, deadline })
    if (local.pending) return PENDING_RESULT
    const fingerprint = fingerprintOf({ ctx, local, settingsKey: await settingsKeyOf(ctx).catch(() => '') })
    const key = resolutionKeyOf(ctx)
    const saved = await store.read(key).catch(() => null)
    if (saved && saved.fingerprint === fingerprint && Number(saved.next_check_at) > now()) return resultOfRow(saved)
    if (inflight.has(key)) return inflight.get(key)
    const running = runTitleChain({ ctx, local, fingerprint, saved, deadline }).finally(() => inflight.delete(key))
    inflight.set(key, running)
    return running
  }

  const localEvidenceOf = async ({ ctx, deadline }) => {
    const found = {}
    for (const stage of LOCAL_STAGES) {
      found[stage] = await stageWithin({ stage, ctx, deadline })
      if (found[stage].pending) return { pending: true, found }
    }
    return { pending: false, found }
  }

  const runTitleChain = async ({ ctx, local, fingerprint, saved, deadline }) => {
    let weak = null
    let errored = false
    const settle = (result) => (errored ? PENDING_RESULT : remember({ ctx, fingerprint, saved, result }))
    for (const stage of chainOf({ kind: ctx.kind })) {
      if (stage === 'choice') continue
      if (stage === FINAL_STAGE) return settle(FINAL_RESULT)
      if (stage === 'derived') {
        if (weak) return settle(derivedResultOf(weak))
        continue
      }
      const found = local.found[stage] ?? await stageWithin({ stage, ctx, deadline })
      if (found.pending) return PENDING_RESULT
      for (const origin of found.sources) {
        const verdict = await judge({ origin, shape: ctx.shape, minWidth: minWidthOf({ minWidths, stage, shape: ctx.shape }), deadline })
        if (verdict.pending) return PENDING_RESULT
        if (verdict.errored) errored = true
        if (verdict.fits) return remember({ ctx, fingerprint, saved, result: { stage, origin, transform: 'none', pending: false }, errored })
        if (verdict.loaded && !weak) weak = { origin, rightShape: verdict.rightShape }
      }
    }
    return settle(FINAL_RESULT)
  }

  const runOuterChain = async ({ chain, ctx, budget = outerBudgetMs }) => {
    const deadline = now() + budget
    let pendingSeen = false
    for (const stage of chain) {
      if (stage === FINAL_STAGE) return pendingSeen ? PENDING_RESULT : FINAL_RESULT
      if (stage === 'title') {
        const fromTitle = await resolveTitle({ ...ctx, recordingId: null, eventId: null })
        if (fromTitle.pending) pendingSeen = true
        else if (fromTitle.stage !== FINAL_STAGE) return fromTitle
        continue
      }
      const found = await stageWithin({ stage, ctx, deadline })
      if (found.pending) pendingSeen = true
      const loaded = await firstLoaded({ sources: found.sources, deadline })
      if (loaded.origin) return { stage, origin: loaded.origin, transform: 'none', pending: false }
      if (loaded.pending) pendingSeen = true
    }
    return pendingSeen ? PENDING_RESULT : FINAL_RESULT
  }

  const firstLoaded = async ({ sources, deadline }) => {
    let failed = false
    for (const origin of sources) {
      const image = await within(loadImage(origin), deadline - now())
      if (image === TIMED_OUT) return { origin: null, pending: true }
      if (image === LOAD_FAILED) failed = true
      else if (image) return { origin, pending: false }
    }
    return { origin: null, pending: failed }
  }

  const stageWithin = async ({ stage, ctx, deadline }) => {
    const step = stages[stage]
    if (!step) return NO_SOURCES
    const found = await within(Promise.resolve().then(() => step(ctx)), deadline - now())
    if (found === TIMED_OUT) return { sources: [], pending: true }
    return { sources: [...new Set(found?.sources ?? [])], pending: Boolean(found?.pending) }
  }

  const judge = async ({ origin, shape, minWidth, deadline }) => {
    const image = await within(loadImage(origin), deadline - now())
    if (image === TIMED_OUT) return { pending: true }
    if (image === LOAD_FAILED) return { loaded: false, errored: true }
    if (!image?.body) return { loaded: false }
    const size = await sizeOf(image).catch(() => null)
    if (!size?.width) return { loaded: false }
    const rightShape = shape === POSTER_SHAPE ? isPortraitSize(size) : isLandscapeSize(size)
    return { loaded: true, rightShape, fits: rightShape && size.width >= minWidth }
  }

  const remember = async ({ ctx, fingerprint, saved, result, errored = false }) => {
    if (!isStorableOrigin(result.origin)) return result
    const settled = SETTLED_STAGES.has(result.stage)
    const step = settled && saved?.fingerprint === fingerprint && SETTLED_STAGES.has(saved.stage) ? Number(saved.miss_step) + 1 : 0
    const waitMs = errored ? errorRetryMs : (settled ? missRetryMs[Math.min(step, missRetryMs.length - 1)] : hitRecheckMs)
    const change = pictureChangeOf({ saved, result })
    const showKey = showKeyOf(ctx.title)
    await store.write({
      resolution_key: resolutionKeyOf(ctx),
      title_key: ctx.titleKey,
      kind: ctx.kind,
      shape: ctx.shape,
      stage: result.stage,
      origin: result.origin ?? null,
      transform: result.transform,
      fingerprint,
      miss_step: settled ? step : 0,
      resolved_at: now(),
      next_check_at: now() + waitMs,
      stamp: change.stamp,
      show_key: showKey,
    }).catch(() => {})
    if (change.changed) {
      answeredPending.delete(resolutionKeyOf(ctx))
      onResolved({ key: showKey, kind: stampKindOf(ctx.shape), stamp: change.stamp })
    }
    return result
  }

  const stampsByKey = async () => {
    const rows = await store.stamped().catch(() => [])
    const byKey = new Map()
    for (const row of [...rows].sort((a, b) => Number(a.resolved_at) - Number(b.resolved_at))) {
      if (!row.show_key || !row.stamp) continue
      byKey.set(row.show_key, { ...byKey.get(row.show_key), [stampKindOf(row.shape)]: row.stamp })
    }
    return byKey
  }

  const forget = (title) => store.removeTitle(showTitleKey(title)).catch(() => {})

  const invalidate = ({ title, kind, shape }) =>
    store.remove(resolutionKeyOf({ titleKey: showTitleKey(title), kind, shape })).catch(() => {})

  return { resolve, forget, invalidate, stampsByKey }
}

const outerKeyOf = ({ recordingId, eventId }) => (recordingId != null ? `episode|${recordingId}` : `event|${eventId}`)

export const pictureStampOf = ({ origin, transform }) => createHash('sha256')
  .update(`${origin ?? ''}|${transform ?? ''}`)
  .digest('hex')
  .slice(0, PICTURE_STAMP_LENGTH)

export const pictureChangeOf = ({ saved, result }) => {
  const picture = `${result.origin ?? ''}|${result.transform ?? ''}`
  if (!saved) return { changed: Boolean(result.origin), stamp: null }
  if (`${saved.origin ?? ''}|${saved.transform ?? ''}` === picture) return { changed: false, stamp: saved.stamp ?? null }
  const browserMayHoldOldPicture = Boolean(saved.origin || saved.stamp)
  return { changed: true, stamp: browserMayHoldOldPicture ? pictureStampOf(result) : null }
}

export const stampKindOf = (shape) => (shape === POSTER_SHAPE ? 'poster' : 'background')

export const imageSizeOf = async (image) => {
  const { width, height } = await sharp(image.body).metadata()
  return { width, height }
}

const fingerprintOf = ({ ctx, local, settingsKey }) => createHash('sha256')
  .update(JSON.stringify([
    FINGERPRINT_VERSION,
    ctx.kind,
    ctx.shape,
    LOCAL_STAGES.map((stage) => local.found[stage]?.sources ?? []),
    settingsKey,
  ]))
  .digest('hex')
  .slice(0, FINGERPRINT_LENGTH)

const derivedResultOf = (weak) => ({
  stage: 'derived',
  origin: weak.origin,
  transform: weak.rightShape ? 'none' : 'pad',
  pending: false,
})

const minWidthOf = ({ minWidths, stage, shape }) => {
  if (shape === POSTER_SHAPE) return minWidths.poster
  return stage === 'plex' ? minWidths.plex : minWidths.landscape
}

const isStorableOrigin = (origin) => !/x-plex-token=/i.test(String(origin ?? ''))

const chosenTransformOf = (shape) => (shape === POSTER_SHAPE ? 'none' : 'pad')

const resultOfRow = (row) => ({ stage: row.stage, origin: row.origin ?? null, transform: row.transform, pending: false })

const guideKindOfCounts = (counts) => {
  const total = counts[MOVIE_KIND] + counts[SERIES_KIND] + counts[ONE_OFF_KIND]
  if (counts[MOVIE_KIND] === total) return MOVIE_KIND
  return counts[SERIES_KIND] >= counts[ONE_OFF_KIND] ? SERIES_KIND : ONE_OFF_KIND
}

const within = (promise, ms) => {
  if (ms <= 0) {
    Promise.resolve(promise).catch(() => {})
    return Promise.resolve(TIMED_OUT)
  }
  let timer = null
  return Promise.race([
    Promise.resolve(promise).catch(() => LOAD_FAILED),
    new Promise((resolve) => { timer = setTimeout(resolve, ms, TIMED_OUT) }),
  ]).finally(() => clearTimeout(timer))
}

const databaseStore = {
  read: (key) => db('art_resolutions').where({ resolution_key: key }).first(),
  write: (row) => db('art_resolutions').insert(row).onConflict('resolution_key').merge(),
  remove: (key) => db('art_resolutions').where({ resolution_key: key }).del(),
  removeTitle: (titleKey) => db('art_resolutions').where({ title_key: titleKey }).del(),
  stamped: () => db('art_resolutions').whereNotNull('stamp').select('show_key', 'shape', 'stamp', 'resolved_at'),
}

const NOT_MOVIE_OVERRIDE = 'not-movie'
const OVERRIDE_KINDS = { movie: MOVIE_KIND, show: SERIES_KIND, 'one-off': ONE_OFF_KIND }
const LOCAL_STAGES = ['plex', 'recording', 'guide']
const SETTLED_STAGES = new Set(['derived', FINAL_STAGE])
const TIMED_OUT = Symbol('timed out')
const LOAD_FAILED = Symbol('load failed')
const NO_SOURCES = { sources: [], pending: false }
const FINAL_RESULT = { stage: FINAL_STAGE, origin: null, transform: 'none', pending: false }
const PENDING_RESULT = { stage: null, origin: null, transform: null, pending: true }
const FINGERPRINT_VERSION = 'art-v2'
const FINGERPRINT_LENGTH = 24
const RESOLVE_BUDGET_MS = 3000
const OUTER_BUDGET_MS = 1500
const MIN_WIDTHS = { poster: 300, plex: 300, landscape: 640 }
const HOUR_MS = 60 * 60 * 1000
const HIT_RECHECK_MS = 7 * 24 * HOUR_MS
const ERROR_RETRY_MS = 5 * 60 * 1000
const PICTURE_STAMP_LENGTH = 10
const FOLLOW_UP_DELAYS_MS = [2000, 15_000, 60_000]
const FOLLOW_UP_BUDGET_MS = 20_000
const MAX_PENDING_ANSWERS = 2000
const MISS_RETRY_MS = [6 * HOUR_MS, 24 * HOUR_MS, 3 * 24 * HOUR_MS, 7 * 24 * HOUR_MS]
