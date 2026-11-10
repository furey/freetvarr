import { GUIDE_MERGED_FEED_KEY } from './guide-merge.js'
import { GuideError } from './tvheadend-guide.js'
import {
  NOTICE_HIDDEN,
  REPOINT_CONFIRMED,
  REPOINT_KEPT,
  REPOINT_KEY,
  REPOINT_NOTICE_KEY,
  automaticChoiceOf,
  channelRowsOf,
  degradedPairsOf,
  listingModeProblemOf,
  noticeOf,
  pinProblemOf,
  pinsWith,
  readListingChoice,
  repointPlanOf,
  saveListingChoice,
  sourceRowsOf,
} from './guide-listings.js'

export const createGuideSourceService = ({
  getSetting,
  setSetting,
  guideMerge,
  rankedSources,
  health,
  inspect = async () => null,
  feedUrl = async () => null,
  isFeedUrl = () => false,
  applyRepoint,
  plannedSteps = () => [],
  rollbackRepoint = async () => [],
  otherBusy = () => false,
  noticeTtlMs = NOTICE_TTL_MS,
  now = Date.now,
}) => {
  let repointRun = null
  let noticeCache = null
  let noticeLoading = null

  const journal = {
    save: (undo) => setSetting(REPOINT_RUN_KEY, JSON.stringify(undo)),
    clear: () => setSetting(REPOINT_RUN_KEY, ''),
    read: async () => {
      try {
        return JSON.parse((await getSetting(REPOINT_RUN_KEY)) || 'null')
      } catch {
        return null
      }
    },
  }

  const overview = async ({ withTvheadend = false } = {}) => {
    const [plan, latest, choice, savedChannels, fileAt, mergedOn, state, hidden, regions] = await Promise.all([
      guideMerge.planNow(),
      health.latest(),
      readListingChoice(getSetting),
      guideMerge.savedChannels().then((channels) => channels ?? []),
      guideMerge.builtAt(),
      getSetting(GUIDE_MERGED_FEED_KEY).then((value) => value === 'on'),
      getSetting(REPOINT_KEY),
      getSetting(REPOINT_NOTICE_KEY).then((value) => value === NOTICE_HIDDEN),
      guideMerge.builtRegions(),
    ])
    const builtAt = regions ? fileAt : null
    const sources = sourceRowsOf({ ranked: rankedSources(), latest, nowMs: now() })
    const [inspection, address] = withTvheadend ? await Promise.all([inspect().catch(() => null), feedUrl().catch(() => null)]) : [null, null]
    const regionOfUrl = (url) => plan?.secondary?.source.regionOfUrl?.(url) ?? null
    const grabberUrl = inspection?.module?.enabled ? inspection.module.url : ''
    const region = (grabberUrl && !isFeedUrl(grabberUrl) && regionOfUrl(grabberUrl)) || plan?.secondary?.region || null
    const repoint = repointPlanOf({
      inspection,
      feedUrl: address,
      plan,
      builtAt,
      savedChannels,
      sources,
      state,
      mergedOn,
      isFeedUrl,
      isMergeableUrl: (url) => Boolean(regionOfUrl(url)),
      region,
      builtRegion: regions?.secondaryRegion ?? null,
    })
    return {
      available: Boolean(plan),
      mergedOn,
      builtAt,
      lastBuild: guideMerge.latest(),
      choice,
      sources,
      primaryId: plan?.primary?.source.id ?? null,
      secondaryId: plan?.secondary?.source.id ?? null,
      channels: channelRowsOf({
        savedChannels,
        latest,
        choice,
        primaryId: plan?.primary?.source.id ?? null,
        secondaryId: plan?.secondary?.source.id ?? null,
      }),
      degradedPairs: degradedPairsOf(latest.channels),
      repoint,
      hidden,
      job: repointRun,
    }
  }

  const status = async () => {
    const { degradedPairs, hidden, ...rest } = await overview({ withTvheadend: true })
    return { ...rest, notice: noticeOf({ repoint: rest.repoint, hidden }) }
  }

  const notice = async ({ fresh = false } = {}) => {
    if (!fresh && noticeCache && noticeCache.expiresAt > now()) return noticeCache.value
    noticeLoading ??= overview({ withTvheadend: true })
      .then((view) => noticeOf({ repoint: { ...view.repoint, pointed: view.mergedOn || view.repoint.pointed }, hidden: view.hidden }))
      .catch(() => ({ show: false, added: 0 }))
      .then((value) => {
        noticeCache = { value, expiresAt: now() + noticeTtlMs }
        return value
      })
      .finally(() => { noticeLoading = null })
    return noticeLoading
  }

  const cachedNotice = () => {
    if (!noticeCache || noticeCache.expiresAt <= now()) notice().catch(() => {})
    return noticeCache?.value ?? null
  }

  const forgetNotice = () => { noticeCache = null }

  const busy = () => Boolean(repointRun?.running)

  const recover = async () => {
    const undo = await journal.read()
    if (!undo) return null
    const run = { running: true, steps: [], result: null }
    repointRun = run
    try {
      await rollbackRepoint(undo)
      await journal.clear()
      Object.assign(run, { running: false, result: { ok: false, code: 'interrupted', restored: true, ...repointFailureOf({ code: 'interrupted', restored: true }) } })
    } catch (err) {
      Object.assign(run, { running: false, result: { ok: false, code: 'interrupted', restored: false, error: `Freetvarr stopped while it changed the guide, and could not put TVHeadend back (${err.message}). It tries again when it next starts.`, next: 'Check the TVHeadend connection.' } })
    }
    forgetNotice()
    return run
  }

  const setMode = async (mode) => {
    const problem = listingModeProblemOf({ mode, sourceIds: rankedSources().map((source) => source.id) })
    if (problem) return { problem }
    const choice = await readListingChoice(getSetting)
    await saveListingChoice({ setSetting, choice: { ...choice, mode } })
    guideMerge.requestBuild()
    return { choice: { ...choice, mode } }
  }

  const setPin = async ({ channel, source }) => {
    const savedChannels = (await guideMerge.savedChannels()) ?? []
    const problem = pinProblemOf({
      channel,
      source,
      sourceIds: rankedSources().map((candidate) => candidate.id),
      channelIds: savedChannels.map((saved) => saved.id),
    })
    if (problem) return { problem }
    const choice = await readListingChoice(getSetting)
    const next = { ...choice, pins: pinsWith({ pins: choice.pins, channel, source }) }
    await saveListingChoice({ setSetting, choice: next })
    guideMerge.requestBuild()
    return { choice: next }
  }

  const switchToAutomatic = async () => {
    const [choice, latest] = await Promise.all([readListingChoice(getSetting), health.latest()])
    const next = automaticChoiceOf({ choice, degradedPairs: degradedPairsOf(latest.channels) })
    await saveListingChoice({ setSetting, choice: next })
    guideMerge.requestBuild()
    return { choice: next }
  }

  const keepGrabber = async () => {
    await setSetting(REPOINT_KEY, REPOINT_KEPT)
    forgetNotice()
    return { ok: true }
  }

  const hideNotice = async () => {
    await setSetting(REPOINT_NOTICE_KEY, NOTICE_HIDDEN)
    forgetNotice()
    return { ok: true }
  }

  const startRepoint = async () => {
    if (repointRun?.running || otherBusy()) return { busy: true }
    const previous = repointRun
    const run = { running: true, steps: plannedSteps().map(({ id, label }) => ({ id, label, status: 'pending', detail: null })), result: null }
    repointRun = run
    const view = await overview({ withTvheadend: true }).catch((err) => ({ failed: err }))
    const pending = view.failed ? null : await journal.read()
    const problem = view.failed?.message
      ?? (pending ? 'Freetvarr has not yet put back an earlier guide change. Restart Freetvarr, then try again.' : null)
      ?? (view.repoint.reason ? REPOINT_REASONS[view.repoint.reason] ?? view.repoint.reason : null)
    if (problem) {
      repointRun = previous
      return { problem }
    }
    const finish = applyRepoint({
      feedUrl: view.repoint.feedUrl,
      journal,
      onProgress: (steps) => { run.steps = steps },
    })
      .catch((err) => ({ ok: false, failedStep: null, code: null, error: err.message, steps: run.steps }))
      .then(async (result) => {
        const saved = result.ok ? await setSetting(REPOINT_KEY, REPOINT_CONFIRMED).then(() => result, (err) => ({ ...result, ok: false, error: err.message })) : result
        Object.assign(run, { running: false, steps: saved.steps, result: saved.ok ? saved : { ...saved, ...repointFailureOf(saved) } })
        forgetNotice()
        return run
      })
    return { run, finish }
  }

  const repointProgress = () => repointRun ?? { running: false, steps: [], result: null }

  return { overview, status, notice, cachedNotice, busy, recover, setMode, setPin, switchToAutomatic, keepGrabber, hideNotice, startRepoint, repointProgress }
}

export const createMergedFeedSwitch = ({ getSetting, setSetting, guideMerge, isFeedUrl, mergedKey, sourceKey }) => {
  const turnOn = async ({ previousUrl, report = () => {}, remember = async () => {} }) => {
    const [merged, sourceUrl] = await Promise.all([getSetting(mergedKey), getSetting(sourceKey)])
    const previous = { merged, sourceUrl }
    await remember(previous)
    if (previousUrl && !isFeedUrl(previousUrl)) await setSetting(sourceKey, previousUrl)
    if (!(await guideMerge.matchesPlan())) {
      report({ region: (await guideMerge.planNow())?.secondary?.region ?? 'your region' })
      if (!(await guideMerge.buildForPlan())) {
        throw new GuideError('Freetvarr could not build the merged guide for the region your grabber reads.', 'build-failed')
      }
    }
    await setSetting(mergedKey, 'on')
    return previous
  }

  const restore = async (previous) => {
    if (!previous) return
    await setSetting(mergedKey, previous.merged ?? '')
    await setSetting(sourceKey, previous.sourceUrl ?? '')
  }

  return { turnOn, restore }
}

export const mountGuideSourceRoutes = ({ app, csrf, readLimiter, writeLimiter, service, onError }) => {
  const reply = (res, outcome) => {
    if (outcome.problem) return res.status(400).json({ error: outcome.problem })
    res.json(outcome)
  }

  app.get('/api/guide-sources', readLimiter, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      res.json(await service.status())
    } catch (err) {
      onError(res, err, 'guide-sources')
    }
  })

  app.get('/api/guide-sources/notice', readLimiter, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      res.json(await service.notice({ fresh: req.query.fresh === '1' }))
    } catch (err) {
      onError(res, err, 'guide-sources-notice')
    }
  })

  app.post('/api/guide-sources/mode', writeLimiter, csrf, async (req, res) => {
    try {
      reply(res, await service.setMode(String(req.body?.mode ?? '')))
    } catch (err) {
      onError(res, err, 'guide-sources-mode')
    }
  })

  app.post('/api/guide-sources/pins', writeLimiter, csrf, async (req, res) => {
    try {
      reply(res, await service.setPin({ channel: req.body?.channel, source: String(req.body?.source ?? '') }))
    } catch (err) {
      onError(res, err, 'guide-sources-pins')
    }
  })

  app.post('/api/guide-sources/automatic', writeLimiter, csrf, async (req, res) => {
    try {
      reply(res, await service.switchToAutomatic())
    } catch (err) {
      onError(res, err, 'guide-sources-automatic')
    }
  })

  app.post('/api/guide-sources/keep-grabber', writeLimiter, csrf, async (req, res) => {
    try {
      reply(res, await service.keepGrabber())
    } catch (err) {
      onError(res, err, 'guide-sources-keep')
    }
  })

  app.post('/api/guide-sources/notice/hide', writeLimiter, csrf, async (req, res) => {
    try {
      reply(res, await service.hideNotice())
    } catch (err) {
      onError(res, err, 'guide-sources-notice-hide')
    }
  })

  app.post('/api/guide-sources/repoint', writeLimiter, csrf, async (req, res) => {
    try {
      const outcome = await service.startRepoint()
      if (outcome.busy) return res.status(409).json({ error: 'Freetvarr is already changing the guide.' })
      if (outcome.problem) return res.status(409).json({ error: outcome.problem })
      res.status(202).json({ ok: true, steps: outcome.run.steps })
    } catch (err) {
      onError(res, err, 'guide-sources-repoint')
    }
  })

  app.get('/api/guide-sources/repoint/progress', readLimiter, (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(service.repointProgress())
  })
}

export const repointFailureOf = ({ code, error, restored }) => {
  const back = restored ? ' TVHeadend reads its earlier guide again.' : ''
  return ({
    'no-grabber': { error: 'This TVHeadend cannot download a guide from an address.', next: 'Keep the guide TVHeadend has.' },
    'not-fetched': {
      error: `TVHeadend did not fetch the guide from Freetvarr within 150 seconds.${back}`,
      next: 'Check that TVHeadend can reach Freetvarr on your network, then try again.',
    },
    'feed-unreachable': { error: `${error}${back}`, next: 'Try again in a few minutes.' },
    'not-updated': {
      error: `TVHeadend fetched the merged guide, but its listings did not change within 5 minutes.${back}`,
      next: 'Try again later. If it happens again, keep your grabber as it is.',
    },
    interrupted: {
      error: `Freetvarr stopped while it changed the guide.${back}`,
      next: 'Try again.',
    },
    'build-failed': { error: `Freetvarr could not build the merged guide for the region your grabber reads.${back}`, next: 'Try again later.' },
    'download-timeout': { error: `TVHeadend did not load the guide channels in 5 minutes.${back}`, next: 'Try again.' },
  })[code] ?? { error: `${error}${back}`, next: 'Try again.' }
}

const REPOINT_RUN_KEY = 'guide_repoint_run'
const NOTICE_TTL_MS = 5 * 60_000

const REPOINT_REASONS = {
  'no-plan': 'Freetvarr has no merged guide for your country yet.',
  'no-tvheadend': 'Freetvarr could not read TVHeadend.',
  'no-grabber': 'This TVHeadend cannot download a guide from an address.',
  'custom-grabber': 'TVHeadend reads a guide address that Freetvarr does not merge, so it stays as it is.',
  'no-address': 'Freetvarr found no address that TVHeadend can reach it on.',
  building: 'Freetvarr is still building the merged guide. Try again in a few minutes.',
}
