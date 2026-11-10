import { GUIDE_MERGED_FEED_KEY } from './guide-merge.js'
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
  now = Date.now,
}) => {
  let repointRun = null

  const overview = async ({ withTvheadend = false } = {}) => {
    const [plan, latest, choice, savedChannels, builtAt, mergedOn, state, hidden] = await Promise.all([
      guideMerge.planNow(),
      health.latest(),
      readListingChoice(getSetting),
      guideMerge.savedChannels().then((channels) => channels ?? []),
      guideMerge.builtAt(),
      getSetting(GUIDE_MERGED_FEED_KEY).then((value) => value === 'on'),
      getSetting(REPOINT_KEY),
      getSetting(REPOINT_NOTICE_KEY).then((value) => value === NOTICE_HIDDEN),
    ])
    const sources = sourceRowsOf({ ranked: rankedSources(), latest, nowMs: now() })
    const [inspection, address] = withTvheadend ? await Promise.all([inspect().catch(() => null), feedUrl().catch(() => null)]) : [null, null]
    const isMergeableUrl = (url) => Boolean(plan?.secondary?.source.regionOfUrl?.(url))
    const repoint = repointPlanOf({ inspection, feedUrl: address, plan, builtAt, savedChannels, sources, state, mergedOn, isFeedUrl, isMergeableUrl })
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

  const notice = async () => {
    const view = await overview()
    const ready = view.available && Boolean(view.builtAt) && !view.mergedOn
    return noticeOf({ repoint: { ...view.repoint, reason: ready ? null : 'not-ready', pointed: false }, hidden: view.hidden })
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
    return { ok: true }
  }

  const hideNotice = async () => {
    await setSetting(REPOINT_NOTICE_KEY, NOTICE_HIDDEN)
    return { ok: true }
  }

  const startRepoint = async () => {
    if (repointRun?.running) return { busy: true }
    const previous = repointRun
    const run = { running: true, steps: [], result: null }
    repointRun = run
    const view = await overview({ withTvheadend: true }).catch((err) => ({ failed: err }))
    const problem = view.failed?.message ?? (view.repoint.reason ? REPOINT_REASONS[view.repoint.reason] ?? view.repoint.reason : null)
    if (problem) {
      repointRun = previous
      return { problem }
    }
    const finish = applyRepoint({
      feedUrl: view.repoint.feedUrl,
      onProgress: (steps) => { run.steps = steps },
    })
      .catch((err) => ({ ok: false, failedStep: null, code: null, error: err.message, steps: run.steps }))
      .then(async (result) => {
        const saved = result.ok ? await setSetting(REPOINT_KEY, REPOINT_CONFIRMED).then(() => result, (err) => ({ ...result, ok: false, error: err.message })) : result
        Object.assign(run, { running: false, steps: saved.steps, result: saved.ok ? saved : { ...saved, ...repointFailureOf(saved) } })
        return run
      })
    return { run, finish }
  }

  const repointProgress = () => repointRun ?? { running: false, steps: [], result: null }

  return { overview, status, notice, setMode, setPin, switchToAutomatic, keepGrabber, hideNotice, startRepoint, repointProgress }
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
      res.json(await service.notice())
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
    'download-timeout': { error: `TVHeadend did not load the guide channels in 5 minutes.${back}`, next: 'Try again.' },
  })[code] ?? { error: `${error}${back}`, next: 'Try again.' }
}

const REPOINT_REASONS = {
  'no-plan': 'Freetvarr has no merged guide for your country yet.',
  'no-tvheadend': 'Freetvarr could not read TVHeadend.',
  'no-grabber': 'This TVHeadend cannot download a guide from an address.',
  'custom-grabber': 'TVHeadend reads a guide address that Freetvarr does not merge, so it stays as it is.',
  'no-address': 'Freetvarr found no address that TVHeadend can reach it on.',
  building: 'Freetvarr is still building the merged guide. Try again in a few minutes.',
}
