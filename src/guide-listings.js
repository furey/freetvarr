import { LISTINGS_AUTOMATIC, LISTINGS_MODE_KEY, LISTINGS_PINS_KEY } from './guide-source-health.js'

export const REPOINT_KEY = 'guide_repoint'
export const REPOINT_NOTICE_KEY = 'guide_repoint_notice'
export const REPOINT_CONFIRMED = 'confirmed'
export const REPOINT_KEPT = 'kept'
export const NOTICE_HIDDEN = 'hidden'
export const REPOINT_RECORD_KEY = 'guide_repoint_record'

export const readListingChoice = async (getSetting) => {
  const [mode, pins] = await Promise.all([getSetting(LISTINGS_MODE_KEY), getSetting(LISTINGS_PINS_KEY)])
  return { mode: mode || LISTINGS_AUTOMATIC, pins: parsePins(pins) }
}

export const saveListingChoice = async ({ setSetting, choice }) => {
  await setSetting(LISTINGS_MODE_KEY, choice.mode)
  await setSetting(LISTINGS_PINS_KEY, JSON.stringify(choice.pins))
  return choice
}

export const listingModeProblemOf = ({ mode, sourceIds }) => {
  if (mode === LISTINGS_AUTOMATIC || sourceIds.includes(mode)) return null
  return `Choose Automatic or one of: ${sourceIds.join(', ')}.`
}

export const pinProblemOf = ({ channel, source, sourceIds, channelIds }) => {
  if (typeof channel !== 'string' || !channelIds.includes(channel)) return 'Choose a channel from the merged guide.'
  if (source !== '' && !sourceIds.includes(source)) return `Choose Automatic or one of: ${sourceIds.join(', ')}.`
  return null
}

export const pinsWith = ({ pins, channel, source }) => {
  const { [channel]: _dropped, ...others } = pins
  return source ? { ...others, [channel]: source } : others
}

export const automaticChoiceOf = ({ choice, degradedPairs = new Set() }) => ({
  mode: LISTINGS_AUTOMATIC,
  pins: Object.fromEntries(Object.entries(choice.pins).filter(([channel, source]) => !degradedPairs.has(`${source}|${channel}`))),
})

export const degradedPairsOf = (channelRows = []) => new Set(channelRows
  .filter((row) => row.degraded)
  .map((row) => `${row.source}|${row.channel}`))

export const sourceRowsOf = ({ ranked = [], latest = { sources: [] }, nowMs = Date.now() }) => ranked.map((source) => {
  const row = latest.sources.find((candidate) => candidate.source === source.id) ?? null
  return {
    id: source.id,
    label: source.label ?? source.id,
    measured: Boolean(row),
    score: row?.score ?? null,
    horizonDays: row ? Math.floor(row.horizonHours / 24) : null,
    coveredHours: row?.coveredHours ?? null,
    describedShare: row?.describedShare ?? null,
    agreement: row?.agreement ?? null,
    failureRate: row && row.fetchAttempts ? Math.round((100 * row.fetchFailures) / row.fetchAttempts) / 100 : null,
    lastSuccessAt: row?.lastSuccessAt ?? null,
    lastSuccessAgoHours: row?.lastSuccessAt ? Math.round((nowMs - row.lastSuccessAt) / HOUR_MS) : null,
    degraded: Boolean(row?.degraded),
  }
})

export const channelRowsOf = ({ savedChannels = [], latest = { channels: [] }, choice = { pins: {} }, primaryId = null, secondaryId = null }) => {
  const rowsByChannel = new Map()
  for (const row of latest.channels) {
    if (!rowsByChannel.has(row.channel)) rowsByChannel.set(row.channel, [])
    rowsByChannel.get(row.channel).push(row)
  }
  return savedChannels.map((channel) => {
    const rows = rowsByChannel.get(channel.id) ?? []
    const led = rows.find((row) => row.led)?.source ?? null
    const pin = choice.pins?.[channel.id] ?? null
    return {
      id: channel.id,
      name: channel.names?.[0] ?? channel.id,
      lcn: channel.lcn ?? null,
      sources: [channel.primaryId && primaryId, channel.secondaryId && secondaryId].filter(Boolean),
      pin,
      lead: led,
      fallback: Boolean(led && !pin && choice.mode === LISTINGS_AUTOMATIC && led === secondaryId && channel.primaryId && channel.secondaryId),
      degraded: rows.filter((row) => row.degraded).map((row) => row.source),
    }
  })
}

export const repointPlanOf = ({
  inspection = null,
  feedUrl = null,
  plan = null,
  builtAt = null,
  savedChannels = [],
  sources = [],
  state = null,
  mergedOn = false,
  isFeedUrl = () => false,
  isMergeableUrl = () => true,
  region = null,
  builtRegion = null,
}) => {
  const grabberUrl = inspection?.module?.enabled ? inspection.module.url : ''
  const pointed = Boolean(mergedOn && grabberUrl && isFeedUrl(grabberUrl))
  const custom = Boolean(grabberUrl) && !isFeedUrl(grabberUrl) && !isMergeableUrl(grabberUrl)
  return {
    state: state ?? 'pending',
    reason: reasonOf({ inspection, plan, builtAt, feedUrl, custom }),
    pointed,
    grabberUrl,
    feedUrl,
    channels: savedChannels.length,
    currentChannels: savedChannels.filter((channel) => channel.secondaryId).length,
    added: savedChannels.filter((channel) => !channel.secondaryId).map((channel) => channel.names?.[0] ?? channel.id),
    days: sources.filter((source) => source.horizonDays !== null).map((source) => ({ label: source.label, days: source.horizonDays })),
    region,
    rebuild: Boolean(region && builtRegion && region !== builtRegion),
  }
}

export const switchRecordOf = (undo) => ({
  grabber: undo.grabber,
  merged: undo.merged ?? { merged: '', sourceUrl: '' },
  config: undo.config ?? {},
  links: undo.links ?? [],
})

export const readSwitchRecord = async (getSetting) => {
  try {
    const record = JSON.parse((await getSetting(REPOINT_RECORD_KEY)) || 'null')
    return record?.grabber ? record : null
  } catch {
    return null
  }
}

export const unmergeTargetOf = ({ record = null, grabber, feedUrl = null, sourceUrl = null, shifted = false }) => {
  if (record) {
    return {
      fromRecord: true,
      grabber: record.grabber,
      merged: { merged: '', sourceUrl: record.merged?.sourceUrl ?? '' },
      config: record.config ?? {},
      links: record.links ?? [],
    }
  }
  if (!sourceUrl || !grabber) return null
  const url = shifted ? feedUrl : sourceUrl
  if (!url) return null
  return {
    fromRecord: false,
    grabber: { id: grabber.id, enabled: true, url, priority: grabber.priority ?? null },
    merged: { merged: '', sourceUrl: shifted ? sourceUrl : '' },
    config: {},
    links: [],
  }
}

export const noticeOf = ({ repoint, hidden = false }) => ({
  show: !hidden && repoint.state === 'pending' && !repoint.reason && !repoint.pointed,
  added: repoint.added.length,
})

const reasonOf = ({ inspection, plan, builtAt, feedUrl, custom }) => {
  if (!plan) return 'no-plan'
  if (!inspection) return 'no-tvheadend'
  if (!inspection.module) return 'no-grabber'
  if (custom) return 'custom-grabber'
  if (!feedUrl) return 'no-address'
  if (!builtAt) return 'building'
  return null
}

const parsePins = (raw) => {
  try {
    const parsed = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, source]) => typeof source === 'string' && source))
  } catch {
    return {}
  }
}

const HOUR_MS = 60 * 60_000
