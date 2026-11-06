import { getSetting, setSetting, deleteSetting } from './db.js'
import { anchorAutorecTitle, anchoredTitlesOf, isCurrentAnchor, isSameShowTitle, literalTitleOf } from './autorec-match.js'
import { chosenVariantsOf, loadTitleVariants } from './title-variants.js'
import { tvhRead, tvhWrite } from './tvheadend.js'
import { isTvheadendUnconfigured } from './tvheadend-unconfigured.js'
import { excludedEditionTagsOf, installCountry } from './title-countries.js'

export const anchorPlanOf = ({ autorecs = [], upcoming = [], variants = new Map(), country = installCountry() }) => {
  const excludedTags = excludedEditionTagsOf(country)
  const keeps = ({ entry, titles }) => titles.some((show) => isSameShowTitle({ title: entry.disp_title, show, excludedTags }))
  return autorecs
    .filter((rule) => isAnchorable({ rule, country }))
    .map((rule) => {
      const titles = [rule.name, ...titleVariantsOf(rule), ...chosenVariantsOf({ variants, title: rule.name })]
      return {
        uuid: rule.uuid,
        name: rule.name,
        oldTitle: rule.title,
        newTitle: anchorAutorecTitle(rule.name, titles.slice(1), country),
        droppedTimers: upcoming
          .filter((entry) => entry.autorec === rule.uuid && !keeps({ entry, titles }))
          .map(timerSummaryOf),
      }
    })
}

const titleVariantsOf = (rule) => anchoredTitlesOf(rule.title)?.titles.slice(1) ?? []

export const runAutorecAnchorOnce = (deps = {}) => {
  const country = deps.country ?? installCountry()
  if (running?.country === country) return running.promise
  const previous = running?.promise.catch(() => null) ?? Promise.resolve()
  const promise = previous.then(() => anchorRules({ ...deps, country })).finally(() => {
    if (running?.promise === promise) running = null
  })
  running = { country, promise }
  return promise
}

export const anchorSeriesRulesQuietly = (deps = {}) => runAutorecAnchorOnce(deps).catch((err) => {
  if (!isTvheadendUnconfigured(err)) console.warn(`[rules] series rule titles not changed yet, will try again: ${err.message}`)
  return null
})

const anchorRules = async ({ read = tvhRead, write = tvhWrite, log = console, loadVariants = loadTitleVariants, country = installCountry() }) => {
  if (!country) return null
  const doneMark = await getSetting(AUTOREC_ANCHOR_DONE_KEY)
  if (doneMark === country) return null
  if (!doneMark && TRANS_TASMAN.includes(country) && await getSetting(AUTOREC_ANCHOR_2_10_DONE_KEY)) {
    await setSetting(AUTOREC_ANCHOR_DONE_KEY, country)
    return null
  }
  const [autorecs, upcoming, variants] = await Promise.all([
    read('dvr/autorec/grid', { limit: GRID_LIMIT }),
    read('dvr/entry/grid_upcoming', { limit: GRID_LIMIT }),
    loadVariants(),
  ])
  const rules = autorecs?.entries || []
  const plan = anchorPlanOf({ autorecs: rules, upcoming: upcoming?.entries || [], variants, country })
  for (const rule of rules.filter((rule) => isLeftAsItIs({ rule, country }))) {
    log.log(`[rules] series rule "${rule.name}" (${rule.uuid}) keeps its title "${rule.title}": it is a pattern or was changed in TVHeadend`)
  }
  const failed = []
  for (const change of plan) {
    logChange({ change, log })
    const saved = await write('idnode/save', { node: JSON.stringify({ uuid: change.uuid, title: change.newTitle }) })
      .then(() => true, (err) => {
        log.warn(`[rules] could not change the title of "${change.name}" (${change.uuid}); it keeps "${change.oldTitle}": ${err.message}`)
        return false
      })
    if (!saved) failed.push({ uuid: change.uuid, name: change.name })
  }
  const unapplied = plan.length > failed.length ? await unappliedChangesOf({ plan, failed, read, log }) : []
  const allFailed = [...failed, ...unapplied]
  await recordOutcome({ failed: allFailed, country })
  return { changed: plan.length - allFailed.length, failed: allFailed }
}

const unappliedChangesOf = async ({ plan, failed, read, log }) => {
  const saved = new Map(((await read('dvr/autorec/grid', { limit: GRID_LIMIT }))?.entries || []).map((rule) => [rule.uuid, rule.title]))
  const failedIds = new Set(failed.map((rule) => rule.uuid))
  return plan
    .filter((change) => !failedIds.has(change.uuid) && saved.has(change.uuid) && saved.get(change.uuid) !== change.newTitle)
    .map((change) => {
      log.warn(`[rules] TVHeadend answered but kept the title "${saved.get(change.uuid)}" for "${change.name}" (${change.uuid})`)
      return { uuid: change.uuid, name: change.name }
    })
}

export const readAnchorFailures = async () => {
  const raw = await getSetting(AUTOREC_ANCHOR_FAILED_KEY)
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const isAnchorable = ({ rule, country }) => {
  if (rule?.comment !== CREATOR_COMMENT || rule.fulltext || rule.mergetext) return false
  if (!rule.name || isCurrentAnchor(rule.title, country)) return false
  return rule.title === rule.name || literalTitleOf(rule.title) === rule.name
}

const isLeftAsItIs = ({ rule, country }) =>
  rule?.comment === CREATOR_COMMENT && !isCurrentAnchor(rule.title, country) && !isAnchorable({ rule, country })

const timerSummaryOf = (entry) => ({
  uuid: entry.uuid,
  title: entry.disp_title || '',
  channelName: entry.channelname || '',
  start: Number.isFinite(Number(entry.start)) ? new Date(Number(entry.start) * 1000).toISOString() : null,
})

const logChange = ({ change, log }) => {
  log.log(`[rules] series rule "${change.name}" (${change.uuid}): title "${change.oldTitle}" becomes "${change.newTitle}"`)
  for (const timer of change.droppedTimers) {
    log.log(`[rules] timer "${timer.title}" on ${timer.channelName || 'its channel'} at ${timer.start ?? 'an unknown time'} (${timer.uuid}) stops matching "${change.name}"`)
  }
}

const recordOutcome = async ({ failed, country }) => {
  if (failed.length) {
    await setSetting(AUTOREC_ANCHOR_FAILED_KEY, JSON.stringify(failed))
    return
  }
  await deleteSetting(AUTOREC_ANCHOR_FAILED_KEY)
  await setSetting(AUTOREC_ANCHOR_DONE_KEY, country)
}

let running = null

export const AUTOREC_ANCHOR_DONE_KEY = 'autorec_titles_anchored_for_country'
export const AUTOREC_ANCHOR_2_10_DONE_KEY = 'autorec_titles_reanchored_at'
export const AUTOREC_ANCHOR_FAILED_KEY = 'autorec_anchor_failed'
const CREATOR_COMMENT = 'freetvarr'
const GRID_LIMIT = 1000
const TRANS_TASMAN = ['au', 'nz']
