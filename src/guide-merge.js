import { once } from 'node:events'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import zlib from 'node:zlib'

import { titlesAgree } from './freeview-au.js'
import { showTitleKey } from './show-artwork.js'
import { channelXml, programmeXml } from './guide-sources/xmltv.js'
import { titleKeyOf } from './title-aliases.js'
import { countryForTimeZone } from './zone-countries.js'

export const MERGED_GUIDE_FILE = 'merged.xml.gz'
export const MERGED_CHANNELS_FILE = 'channels.json'
export const SLOT_TOLERANCE_MS = 5 * 60_000
export const GUIDE_MERGED_FEED_KEY = 'guide_merged_feed'

export const createGuideMerge = ({
  dir,
  sources,
  timeZone,
  sourceUrl = async () => null,
  isServing = async () => false,
  channelTriplets = async () => new Map(),
  aliases,
  now = Date.now,
  intervalMs = BUILD_INTERVAL_MS,
  firstDelayMs = FIRST_BUILD_DELAY_MS,
  log = console,
}) => {
  let running = null
  let again = false
  let latest = null
  const timers = []

  const planNow = async () => planSources({
    ranked: sources.forCountry(countryForTimeZone(timeZone())),
    timeZone: timeZone(),
    url: await sourceUrl(),
  })

  const build = async () => {
    const plan = await planNow()
    if (!plan) return null
    const triplets = await channelTriplets().catch((err) => {
      log.warn(`[guide-merge] matching channels by number only: ${err.message}`)
      return new Map()
    })
    const startedAt = now()
    const stats = await writeMergedGuide({ dir, ...plan, channelTriplets: triplets, aliases, now })
    latest = { ...stats, builtAt: now(), durationMs: now() - startedAt }
    log.log(`[guide-merge] ${summaryOf(latest)}`)
    return latest
  }

  const requestBuild = () => {
    if (running) {
      again = true
      return running
    }
    running = build()
      .catch((err) => {
        log.warn(`[guide-merge] kept the last guide file: ${err.message}`)
        latest = { ...latest, failedAt: now(), error: err.message }
        return null
      })
      .finally(() => {
        running = null
        if (again) {
          again = false
          requestBuild()
        }
      })
    return running
  }

  const start = () => {
    const first = setTimeout(requestBuild, firstDelayMs)
    const repeat = setInterval(requestBuild, intervalMs)
    first.unref?.()
    repeat.unref?.()
    timers.push(first, repeat)
  }

  const stop = () => timers.splice(0).forEach((timer) => clearTimeout(timer))

  const servablePath = async () => {
    if (!(await isServing()) || !(await planNow())) return null
    const file = path.join(dir, MERGED_GUIDE_FILE)
    return fsp.access(file).then(() => file, () => null)
  }

  return { start, stop, requestBuild, servablePath, latest: () => latest }
}

export const planSources = ({ ranked = [], timeZone, url = null }) => {
  const secondary = ranked.find((source) => source.feeds) ?? null
  const primary = ranked.find((source) => !source.feeds) ?? null
  if (!secondary && !primary) return null
  const pinnedRegion = url ? secondary?.regionOfUrl(url) : null
  if (url && !pinnedRegion) return null
  const secondaryRegion = pinnedRegion ?? secondary?.regionOf(timeZone) ?? null
  const primaryRegion = primary?.regionOf(timeZone) ?? null
  if (!secondaryRegion && !primaryRegion) return null
  return {
    primary: primaryRegion ? { source: primary, region: primaryRegion } : null,
    secondary: secondaryRegion ? { source: secondary, region: secondaryRegion } : null,
  }
}

export const writeMergedGuide = async ({ dir, primary, secondary, channelTriplets, aliases, now = Date.now }) => {
  await fsp.mkdir(dir, { recursive: true })
  const file = path.join(dir, MERGED_GUIDE_FILE)
  const temporary = `${file}.${process.pid}.tmp`
  const savedChannels = await readSavedChannels(dir)
  const gzip = zlib.createGzip()
  const output = fs.createWriteStream(temporary)
  gzip.pipe(output)
  try {
    const stats = await buildMergedGuide({ primary, secondary, channelTriplets, savedChannels, aliases, now, out: gzip })
    gzip.end()
    await finished(output)
    if (!stats.programmes) throw new Error('every guide source failed')
    await fsp.rename(temporary, file)
    if (stats.secondaryOk) await fsp.writeFile(path.join(dir, MERGED_CHANNELS_FILE), JSON.stringify(stats.channelMap))
    const { channelMap, ...rest } = stats
    return { ...rest, bytes: (await fsp.stat(file)).size }
  } catch (err) {
    gzip.destroy()
    output.destroy()
    await fsp.rm(temporary, { force: true })
    throw err
  }
}

export const buildMergedGuide = async ({
  primary,
  secondary,
  channelTriplets = new Map(),
  savedChannels = null,
  aliases = null,
  now = Date.now,
  out,
}) => {
  const nowMs = now()
  const from = nowMs - PAST_MS
  const primaryTo = nowMs + (primary?.source.horizonDays ?? 0) * DAY_MS
  primary?.source.resetStats?.()
  const [primaryChannels, secondaryChannels] = await Promise.all([
    channelsOf(primary),
    channelsOf(secondary),
  ])
  if (!secondaryChannels.ok && !savedChannels?.length) {
    if (secondary) throw new Error(`${secondary.source.id} failed (${secondaryChannels.error}) and no earlier channel list is saved`)
  }
  const channels = mapChannels({
    primaryChannels: primaryChannels.ok ? primaryChannels.channels : null,
    secondaryChannels: secondaryChannels.ok ? secondaryChannels.channels : null,
    savedChannels,
    channelTriplets,
    prefix: primary?.source.channelIdPrefix ?? 'primary',
  })
  const aliasMap = primary && aliases ? await aliases.load(primary.source.id) : new Map()
  const stats = emptyStats({ primary, secondary, primaryChannels, secondaryChannels })
  const newAliases = []
  const primaryTitles = new Map()
  const secondaryTitleKeys = new Set()
  await write(out, `${FEED_HEAD}${channels.map(channelXml).join('\n  ')}\n  `)
  for (const channel of channels) {
    const [primaryProgrammes, secondaryProgrammes] = await Promise.all([
      listingsOf({ side: primary, channel: channel.primaryId, from, to: primaryTo, ok: primaryChannels.ok }),
      listingsOf({ side: secondary, channel: channel.secondaryId, from, to: Infinity, ok: secondaryChannels.ok }),
    ])
    for (const programme of secondaryProgrammes) secondaryTitleKeys.add(titleKeyOf(programme.title))
    const merged = mergeChannelProgrammes({
      channel: channel.id,
      primary: primaryProgrammes,
      secondary: secondaryProgrammes,
      aliasOf: (title) => aliasMap.get(titleKeyOf(title)) ?? null,
    })
    for (const alias of merged.aliases) {
      aliasMap.set(titleKeyOf(alias.sourceTitle), alias.title)
      newAliases.push(alias)
    }
    for (const title of merged.primaryTitles) primaryTitles.set(titleKeyOf(title), title)
    addCounts(stats, merged.counts)
    stats.programmes += merged.xml.length
    if (merged.xml.length) await write(out, `${merged.xml.join('\n  ')}\n  `)
  }
  await write(out, '</tv>\n')
  const candidates = secondaryChannels.ok
    ? [...primaryTitles].filter(([key]) => !secondaryTitleKeys.has(key) && !aliasMap.has(key)).map(([, title]) => title)
    : []
  if (primary && aliases && (newAliases.length || candidates.length || secondaryChannels.ok)) {
    await aliases.save({
      source: primary.source.id,
      aliases: newAliases,
      candidates,
      seenTitles: secondaryChannels.ok ? secondaryTitleKeys : null,
    })
  }
  return {
    ...stats,
    channels: channels.length,
    aliases: new Set(newAliases.map((alias) => titleKeyOf(alias.sourceTitle))).size,
    candidates: candidates.length,
    primaryRequests: primary?.source.stats?.().requests ?? 0,
    primaryFailedWindows: primary?.source.stats?.().failedWindows ?? 0,
    primarySplitWindows: primary?.source.stats?.().splitWindows ?? 0,
    channelMap: channels,
  }
}

export const mapChannels = ({ primaryChannels, secondaryChannels, savedChannels = null, channelTriplets = new Map(), prefix }) => {
  if (!primaryChannels) return secondaryChannels ? secondaryChannels.map(secondaryChannelOf) : []
  if (!secondaryChannels) return channelsFromSaved({ primaryChannels, savedChannels, prefix })
  const base = secondaryChannels.map(secondaryChannelOf)
  const taken = new Set()
  const added = []
  for (const channel of primaryChannels) {
    const target = targetOf({ channel, base, taken, channelTriplets })
    if (!target) {
      added.push(primaryOnlyChannelOf({ channel, prefix }))
      continue
    }
    target.primaryId = channel.id
    taken.add(target.id)
  }
  return [...base, ...added]
}

export const mergeChannelProgrammes = ({ channel, primary = [], secondary = [], aliasOf = () => null, toleranceMs = SLOT_TOLERANCE_MS }) => {
  const counts = { matched: 0, primaryOnly: 0, secondaryKept: 0, secondaryDropped: 0, titleRewrites: 0 }
  const aliases = []
  const primaryTitles = []
  const used = new Set()
  const out = []
  for (const programme of primary) {
    const partner = partnerOf({ programme, secondary, used, toleranceMs })
    if (partner) {
      used.add(partner)
      counts.matched += 1
      if (partner.title !== programme.title) {
        counts.titleRewrites += 1
        aliases.push({ sourceTitle: programme.title, title: partner.title })
      }
      out.push({ start: programme.start, xml: programmeXml(mergedProgramme({ channel, primary: programme, secondary: partner })) })
      continue
    }
    counts.primaryOnly += 1
    const title = aliasOf(programme.title) ?? programme.title
    if (title !== programme.title) counts.titleRewrites += 1
    else primaryTitles.push(title)
    out.push({ start: programme.start, xml: programmeXml({ ...programme, channel, title, episodeNums: episodeNumsOf({ primary: programme }) }) })
  }
  for (const programme of secondary) {
    if (used.has(programme)) continue
    if (overlapsAny({ programme, others: primary })) {
      counts.secondaryDropped += 1
      continue
    }
    counts.secondaryKept += 1
    out.push({ start: programme.start, xml: programme.xml ?? programmeXml({ ...programme, channel }) })
  }
  return {
    xml: out.sort((a, b) => a.start - b.start).map((entry) => entry.xml),
    aliases,
    primaryTitles,
    counts,
  }
}

export const mergedProgramme = ({ channel, primary, secondary }) => ({
  channel,
  start: primary.start,
  stop: primary.stop,
  title: secondary.title,
  subTitle: primary.subTitle || secondary.subTitle,
  desc: primary.desc || secondary.desc,
  categories: secondary.categories?.length ? secondary.categories : primary.categories ?? [],
  rating: primary.rating || secondary.rating,
  icon: primary.icon || secondary.icon,
  episodeNums: episodeNumsOf({ primary, secondary }),
  extras: secondary.extras ?? [],
})

export const episodeNumsOf = ({ primary, secondary = null }) => {
  const secondaryNums = secondary?.episodeNums ?? []
  const fromSecondary = secondaryNums.filter((num) => NUMBERING_SYSTEMS.has(num.system))
  const numbering = fromSecondary.length ? fromSecondary : numberingOf(primary)
  const episodeOnly = !numbering.length && primary.episode
    ? [{ system: 'xmltv_ns', value: `.${primary.episode - 1}.` }]
    : []
  return [
    ...numbering,
    ...episodeOnly,
    ...(primary.crid ? [{ system: 'crid', value: primary.crid }] : []),
    ...secondaryNums.filter((num) => !NUMBERING_SYSTEMS.has(num.system) && num.system !== 'crid'),
  ]
}

const numberingOf = ({ season, episode }) => {
  if (!season || !episode) return []
  return [
    { system: 'xmltv_ns', value: `${season - 1}.${episode - 1}.` },
    { system: 'SxxExx', value: `S${pad(season)}E${pad(episode)}` },
  ]
}

const partnerOf = ({ programme, secondary, used, toleranceMs }) => {
  const key = showTitleKey(programme.title)
  let best = null
  for (const candidate of secondary) {
    if (candidate.start > programme.start + toleranceMs) break
    const offset = Math.abs(candidate.start - programme.start)
    if (used.has(candidate) || offset > toleranceMs) continue
    if (!titlesAgree(showTitleKey(candidate.title), key)) continue
    if (!best || offset < best.offset) best = { candidate, offset }
  }
  return best?.candidate ?? null
}

const overlapsAny = ({ programme, others }) => others.some((other) =>
  Math.min(programme.stop, other.stop) - Math.max(programme.start, other.start) > OVERLAP_ALLOWANCE_MS)

const targetOf = ({ channel, base, taken, channelTriplets }) => {
  const free = base.filter((candidate) => !taken.has(candidate.id))
  return free.find((candidate) => (channelTriplets.get(candidate.id) ?? []).includes(channel.id))
    ?? (channel.lcn ? free.find((candidate) => candidate.lcn === channel.lcn) : null)
    ?? null
}

const secondaryChannelOf = (channel) => ({
  id: channel.id,
  names: channel.names,
  lcn: channel.lcn,
  icon: channel.icon ?? null,
  primaryId: null,
  secondaryId: channel.id,
})

const primaryOnlyChannelOf = ({ channel, prefix }) => ({
  id: `${prefix}.${channel.id}`,
  names: channel.names,
  lcn: channel.lcn,
  icon: null,
  primaryId: channel.id,
  secondaryId: null,
})

const channelsFromSaved = ({ primaryChannels, savedChannels, prefix }) => {
  const savedByPrimary = new Map((savedChannels ?? []).filter((saved) => saved.primaryId).map((saved) => [saved.primaryId, saved]))
  return primaryChannels.map((channel) => {
    const saved = savedByPrimary.get(channel.id)
    return saved ? { ...saved, secondaryId: null } : primaryOnlyChannelOf({ channel, prefix })
  })
}

const channelsOf = async (side) => {
  if (!side) return { ok: false, channels: [], error: 'no source' }
  try {
    const channels = await side.source.channels(side.region)
    if (!channels.length) return { ok: false, channels: [], error: 'no channels' }
    return { ok: true, channels, error: null }
  } catch (err) {
    return { ok: false, channels: [], error: err.message }
  }
}

const listingsOf = async ({ side, channel, from, to, ok }) => {
  if (!side || !channel || !ok) return []
  try {
    return await side.source.listings({ region: side.region, channel, from, to })
  } catch {
    return []
  }
}

const readSavedChannels = async (dir) => {
  try {
    return JSON.parse(await fsp.readFile(path.join(dir, MERGED_CHANNELS_FILE), 'utf8'))
  } catch {
    return null
  }
}

const write = async (stream, text) => {
  if (!stream.write(text)) await once(stream, 'drain')
}

const emptyStats = ({ primary, secondary, primaryChannels, secondaryChannels }) => ({
  primarySource: primary?.source.id ?? null,
  secondarySource: secondary?.source.id ?? null,
  primaryOk: primaryChannels.ok,
  secondaryOk: secondaryChannels.ok,
  primaryError: primary && !primaryChannels.ok ? primaryChannels.error : null,
  secondaryError: secondary && !secondaryChannels.ok ? secondaryChannels.error : null,
  programmes: 0,
  matched: 0,
  primaryOnly: 0,
  secondaryKept: 0,
  secondaryDropped: 0,
  titleRewrites: 0,
})

const addCounts = (stats, counts) => {
  for (const [key, value] of Object.entries(counts)) stats[key] += value
}

const summaryOf = (stats) => [
  `${stats.programmes} programmes on ${stats.channels} channels in ${Math.round(stats.durationMs / 1000)} s`,
  `${stats.matched} matched, ${stats.primaryOnly} from ${stats.primarySource ?? 'no primary'} only, ${stats.secondaryKept} from ${stats.secondarySource ?? 'no secondary'} only`,
  `${stats.aliases} title aliases`,
  ...(stats.primaryError ? [`${stats.primarySource} failed: ${stats.primaryError}`] : []),
  ...(stats.secondaryError ? [`${stats.secondarySource} failed: ${stats.secondaryError}`] : []),
].join('; ')

const pad = (number) => String(number).padStart(2, '0')

const FEED_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n<tv generator-info-name="Freetvarr">\n  '
const NUMBERING_SYSTEMS = new Set(['xmltv_ns', 'SxxExx', 'onscreen'])
const OVERLAP_ALLOWANCE_MS = 60_000
const DAY_MS = 24 * 60 * 60_000
const PAST_MS = 6 * 60 * 60_000
const BUILD_INTERVAL_MS = 6 * 60 * 60_000
const FIRST_BUILD_DELAY_MS = 3 * 60_000
