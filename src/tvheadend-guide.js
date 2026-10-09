import zlib from 'node:zlib'

import axios from 'axios'

import { countryForTimeZone } from './zone-countries.js'
import GUIDE_SOURCES from './guide-sources.json' with { type: 'json' }

export const inspectGuide = async ({ http, conn }) => {
  const [module, guideChannels, channels] = await Promise.all([
    findUrlGrabber({ http, conn }),
    listGuideChannels({ http, conn }),
    listTvChannels({ http, conn }),
  ])
  const own = module ? guideChannels.filter((g) => g.moduleId === module.key) : []
  const linked = channels.filter((c) => isLinked({ channel: c, guideChannels: own }))
  return { module, guideChannels: own, channels, linked: linked.length }
}

export const suggestGuide = ({ inspection, timeZone = '' }) => {
  const country = countryForTimeZone(timeZone)
  const feeds = GUIDE_SOURCES[country]?.feeds || []
  const city = String(timeZone).split('/').pop().replace(/_/g, ' ').toLowerCase()
  const regional = feeds.find((f) => f.region.toLowerCase() === city) || (feeds.length === 1 ? feeds[0] : null)
  const current = inspection.module?.enabled ? inspection.module.url : ''
  return {
    state: current && inspection.linked > 0 ? 'has-guide' : 'ready',
    available: Boolean(inspection.module),
    url: current || regional?.url || '',
    feeds,
    channels: inspection.channels.length,
    linked: inspection.linked,
  }
}

export const parseFeedChannels = (xml) => [...String(xml).matchAll(/<channel\s+id="([^"]+)"\s*>([\s\S]*?)<\/channel>/g)]
  .map(([, id, body]) => ({
    id: decodeEntities(id),
    names: [...body.matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)].map((m) => decodeEntities(m[1].trim())),
    lcn: Number(body.match(/<lcn>\s*(\d+)\s*<\/lcn>/)?.[1] || 0) || null,
  }))

export const matchGuideChannels = ({ channels, guideChannels, feedChannels, serviceLcns = new Map() }) => {
  const byFeedId = new Map(feedChannels.map((f) => [f.id, f]))
  const candidates = guideChannels.map((g) => ({ ...g, feed: byFeedId.get(g.xmltvId) || null }))
  const noise = commonTokens(channels.map((c) => c.name))
  const nameKey = (name) => normaliseName({ name, noise })
  const links = []
  const unmatched = []
  for (const channel of channels) {
    if (isLinked({ channel, guideChannels })) continue
    const numbers = new Set([channel.number, ...(channel.services || []).map((s) => serviceLcns.get(s))].filter(Boolean))
    const byNumber = candidates.filter((g) => g.feed?.lcn && numbers.has(g.feed.lcn))
    const key = nameKey(channel.name)
    const byName = byNumber.length ? [] : candidates.filter((g) => key && feedNames(g).some((n) => nameKey(n) === key))
    const matches = byNumber.length ? byNumber : byName
    if (!matches.length) {
      unmatched.push(channel)
      continue
    }
    for (const g of matches) links.push({ channelId: channel.id, guideId: g.id, by: byNumber.length ? 'number' : 'name' })
  }
  return { links, unmatched }
}

export const guessGuideChannel = ({ channel, candidates, linked = [] }) => {
  if (isTimeshiftName(channel.name)) return null
  const key = looseKey(channel.name)
  if (!key) return null
  return guessByName({ key, candidates })
    || guessBySibling({ key, linked })
    || guessByNetwork({ key, candidates })
}

export const planGuideRelinks = ({ guideChannels, links }) => {
  const moving = new Set(links.map((l) => l.channelId))
  return guideChannels
    .map((g) => {
      const kept = g.channels.filter((id) => !moving.has(id))
      const added = links.filter((l) => l.guideId === g.id).map((l) => l.channelId)
      return { guideId: g.id, before: g.channels, channels: [...new Set([...kept, ...added])] }
    })
    .filter(({ before, channels }) => !sameMembers(before, channels))
    .map(({ guideId, channels }) => ({ guideId, channels }))
}

export const applyGuideLinks = async ({ http, conn, links, guideChannels, dropListingsOf = [] }) => {
  const saves = planGuideRelinks({ guideChannels, links })
  for (const { guideId, channels } of saves) {
    await http.post('idnode/save', { node: JSON.stringify({ uuid: guideId, channels }) }, conn)
  }
  for (const channelId of dropListingsOf) await dropChannelListings({ http, conn, channelId })
  if (saves.length || dropListingsOf.length) await http.post('epggrab/internal/rerun', { rerun: 1 }, conn)
  return { linked: new Set(links.filter((l) => l.guideId).map((l) => l.channelId)).size, saved: saves.length }
}

export const readTimeshifts = async ({ http, conn, feedChannels }) => {
  const [module, guideChannels, channels] = await Promise.all([
    findUrlGrabber({ http, conn }),
    listGuideChannels({ http, conn }),
    listTvChannels({ http, conn }),
  ])
  const own = module ? guideChannels.filter((g) => g.moduleId === module.key) : []
  return findTimeshifts({ channels, guideChannels: own, feedChannels })
}

export const findTimeshifts = ({ channels, guideChannels, feedChannels }) => {
  const candidates = feedChannels.map((f) => ({ id: f.id, name: f.names[0] || f.id, feed: f }))
  const linked = linkedFeedChannels({ channels, guideChannels })
  const shifts = new Map()
  for (const channel of channels) {
    const hours = timeshiftHours(channel.name)
    if (!hours || feedCarries({ channel, feedChannels })) continue
    const baseId = guessGuideChannel({ channel: { name: timeshiftBaseName(channel.name) }, candidates, linked })
    if (!baseId) continue
    const id = `${baseId}${TIMESHIFT_ID_SUFFIX}${hours}`
    const shift = shifts.get(id) || { id, baseId, hours, names: [], lcn: channel.number }
    shift.names.push(channel.name)
    shifts.set(id, shift)
  }
  return [...shifts.values()]
}

export const shiftedFeedChannels = (shifts) => shifts.map(({ id, names, lcn }) => ({ id, names, lcn }))

export const planGuideSetup = () => ({
  steps: [
    { id: 'feed', label: 'Turn on the guide feed' },
    { id: 'download', label: 'Download the guide' },
    { id: 'link', label: 'Link the guide to your channels' },
  ],
})

export const applyGuideSetup = async ({
  http,
  conn,
  url,
  fetchFeed = fetchFeedChannels,
  countProgrammes = countFeedProgrammes,
  onProgress = () => {},
  shiftedFeed = null,
  pollMs = POLL_MS,
  limitMs = DOWNLOAD_LIMIT_MS,
  feedRequestLimitMs = FEED_REQUEST_LIMIT_MS,
  now = Date.now,
}) => {
  const progress = createProgress({ steps: planGuideSetup().steps, onProgress })
  let current = null
  const run = async (stepId, action) => {
    current = stepId
    progress.start(stepId)
    const result = await action()
    progress.done(stepId)
    return result
  }
  try {
    const { feedChannels, grabberUrl } = await run('feed', async () => {
      const module = await findUrlGrabber({ http, conn })
      if (!module) throw new GuideError('This TVHeadend has no guide download by URL.', 'no-grabber')
      const listed = await fetchFeed(url).catch((err) => {
        throw new GuideError(`Freetvarr could not download the guide (${err.message}).`, 'feed-unreachable')
      })
      if (!listed.length) throw new GuideError('The guide address returned no channels.', 'feed-empty')
      const shifts = shiftedFeed ? await readTimeshifts({ http, conn, feedChannels: listed }) : []
      if (shifts.length) {
        const reached = await pointGrabberAtShiftedFeed({ http, conn, module, url, shiftedFeed, limitMs: feedRequestLimitMs, now })
        if (reached) return { feedChannels: [...listed, ...shiftedFeedChannels(shifts)], grabberUrl: shiftedFeed.url }
        await enableGrabber({ http, conn, module: { ...module, enabled: true, url: shiftedFeed.url }, url })
      } else {
        await enableGrabber({ http, conn, module, url })
        await keepGuideSaved({ http, conn })
      }
      await http.post('epggrab/internal/rerun', { rerun: 1 }, conn)
      return { feedChannels: listed, grabberUrl: url }
    })
    const guideChannels = await run('download', () => waitForGuideChannels({
      http,
      conn,
      feedChannels,
      report: (detail) => progress.detail('download', detail),
      pollMs,
      limitMs,
      now,
    }))
    const outcome = await run('link', async () => {
      const [channels, serviceLcns] = await Promise.all([
        listTvChannels({ http, conn }),
        listServiceLcns({ http, conn }),
      ])
      const matched = matchGuideChannels({ channels, guideChannels, feedChannels, serviceLcns })
      await applyGuideLinks({ http, conn, links: matched.links, guideChannels })
      const linkedIds = new Set(matched.links.map((l) => l.channelId))
      const alreadyLinked = channels.filter((c) => !linkedIds.has(c.id) && isLinked({ channel: c, guideChannels }))
      const byFeedId = new Map(feedChannels.map((f) => [f.id, f]))
      const candidates = guideChannels.map((g) => ({ ...g, feed: byFeedId.get(g.xmltvId) || null }))
      const counts = await countProgrammes(grabberUrl).catch(() => null)
      const pickable = counts ? candidates.filter((g) => counts.get(g.xmltvId)) : candidates
      const linked = linkedChannels({ channels, guideChannels, links: matched.links })
      return {
        grabberUrl,
        linked: linkedIds.size + alreadyLinked.length,
        total: channels.length,
        unmatched: matched.unmatched.map(({ id, name, number }) => ({
          id,
          name,
          number,
          guess: guessGuideChannel({ channel: { name }, candidates: pickable, linked }),
        })),
        options: guideChannelOptions(candidates, counts),
      }
    })
    return { ok: true, ...outcome, steps: progress.steps() }
  } catch (err) {
    if (current) progress.fail(current)
    return {
      ok: false,
      failedStep: current,
      code: err?.code || null,
      error: err?.message || String(err),
      steps: progress.steps(),
    }
  }
}

export const readGuideLinks = async ({ http, conn, countProgrammes = countFeedProgrammes }) => {
  const inspection = await inspectGuide({ http, conn })
  const counts = inspection.module?.url
    ? await countProgrammes(inspection.module.url).catch(() => null)
    : null
  return {
    channels: inspection.channels.map((c) => ({
      id: c.id,
      name: c.name,
      number: c.number,
      guideIds: linkedGuideIds({ channel: c, guideChannels: inspection.guideChannels }),
    })),
    options: guideChannelOptions(inspection.guideChannels, counts),
  }
}

export const linkChannelsByHand = async ({ http, conn, links }) => {
  const inspection = await inspectGuide({ http, conn })
  const known = new Set(inspection.guideChannels.map((g) => g.id))
  const channelIds = new Set(inspection.channels.map((c) => c.id))
  const valid = links.filter((l) => (l.guideId === '' || known.has(l.guideId)) && channelIds.has(l.channelId))
  const guideChannels = inspection.guideChannels.map((g) => ({
    ...g,
    channels: [...new Set([
      ...g.channels,
      ...inspection.channels.filter((c) => c.guide.includes(g.id)).map((c) => c.id),
    ])],
  }))
  const moved = changedLinks({ links: valid, channels: inspection.channels, guideChannels })
  const result = await applyGuideLinks({
    http,
    conn,
    links: valid,
    guideChannels,
    dropListingsOf: moved.map((l) => l.channelId),
  })
  return { ...result, loading: moved.filter((l) => l.guideId).map((l) => l.channelId) }
}

export const waitForNewListings = async ({
  http,
  conn,
  channelIds,
  pollMs = LISTINGS_POLL_MS,
  limitMs = LISTINGS_LIMIT_MS,
  now = Date.now,
}) => {
  const startedAt = now()
  let previous = new Map()
  for (;;) {
    const counts = new Map(await Promise.all(channelIds.map(async (channelId) =>
      [channelId, await countChannelEvents({ http, conn, channelId })])))
    if (channelIds.every((id) => counts.get(id) > 0 && counts.get(id) === previous.get(id))) return true
    if (now() - startedAt >= limitMs) return false
    previous = counts
    await sleep(pollMs)
  }
}

export const createProgrammeCounter = ({
  count = fetchProgrammeCounts,
  ttlMs = PROGRAMME_COUNT_TTL_MS,
  waitMs = PROGRAMME_COUNT_WAIT_MS,
  now = Date.now,
} = {}) => {
  const cache = new Map()
  return (url) => {
    const cached = cache.get(url)
    if (!cached || cached.expiresAt <= now()) {
      const counts = count(url)
      cache.set(url, { counts, expiresAt: now() + ttlMs })
      counts.catch(() => cache.delete(url))
    }
    return resultWithin({ promise: cache.get(url).counts, ms: waitMs })
  }
}

export const fetchProgrammeCounts = async (url, { nowMs = Date.now() } = {}) =>
  tallyProgrammeStream({ stream: await openFeedStream(url), nowMs })

export const openFeedStream = async (url) => {
  const response = await axios.get(url, { responseType: 'stream', timeout: FEED_TIMEOUT_MS, maxRedirects: 5 })
  return GZIP_URL.test(url) ? response.data.pipe(zlib.createGunzip()) : response.data
}

export const countUpcomingProgrammes = ({ xml, nowMs, counts = new Map() }) => {
  for (const [, attributes] of String(xml).matchAll(/<programme\b([^>]*)>/g)) {
    const channel = attributes.match(/\bchannel="([^"]*)"/)?.[1]
    if (!channel) continue
    const stop = parseXmltvTime(attributes.match(/\bstop="([^"]*)"/)?.[1])
    if (stop !== null && stop <= nowMs) continue
    const id = decodeEntities(channel).replace(/\//g, '#')
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  return counts
}

export const parseXmltvTime = (value) => {
  const match = String(value ?? '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2})(\d{2}))?/)
  if (!match) return null
  const [, year, month, day, hour, minute, second = '0', sign, offsetHours = '0', offsetMinutes = '0'] = match
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  const offsetMs = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000
  return sign === '-' ? utc + offsetMs : utc - offsetMs
}

export const fetchFeedChannels = async (url) => {
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: FEED_TIMEOUT_MS,
    maxRedirects: 5,
    headers: { 'Accept-Encoding': 'identity' },
  })
  const text = await readUntil({ stream: response.data, marker: '<programme', maxBytes: FEED_HEAD_BYTES })
  return parseFeedChannels(text)
}

export class GuideError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'GuideError'
    this.code = code
  }
}

const findUrlGrabber = async ({ http, conn }) => {
  const list = await http.get('epggrab/module/list', {}, conn)
  const entry = (list?.entries || []).find((m) => URL_GRABBER_TITLE.test(m.title || ''))
  if (!entry) return null
  const node = (await http.get('idnode/load', { uuid: entry.uuid }, conn))?.entries?.[0]
  const value = (id) => (node?.params || []).find((p) => p.id === id)?.value
  return {
    id: entry.uuid,
    key: value('path') || entry.uuid,
    enabled: value('enabled') === true,
    url: value('args') || '',
  }
}

const enableGrabber = async ({ http, conn, module, url }) => {
  if (module.enabled && module.url === url) return
  await http.post('idnode/save', {
    node: JSON.stringify({ uuid: module.id, enabled: true, args: url, priority: XMLTV_PRIORITY }),
  }, conn)
}

const pointGrabberAtShiftedFeed = async ({ http, conn, module, url, shiftedFeed, limitMs, now }) => {
  await shiftedFeed.useSource(url)
  await enableGrabber({ http, conn, module, url: shiftedFeed.url })
  await keepGuideSaved({ http, conn })
  const since = now()
  await http.post('epggrab/internal/rerun', { rerun: 1 }, conn)
  return shiftedFeed.waitForRequest({ since, limitMs })
}

const keepGuideSaved = async ({ http, conn }) => {
  const config = (await http.get('epggrab/config/load', {}, conn))?.entries?.[0]
  const value = (id) => (config?.params || []).find((p) => p.id === id)?.value
  const changes = {
    ...(Number(value('epgdb_periodicsave')) === 0 ? { epgdb_periodicsave: 1 } : {}),
    ...(value('epgdb_saveafterimport') === false ? { epgdb_saveafterimport: true } : {}),
  }
  if (!Object.keys(changes).length) return
  await http.post('epggrab/config/save', { node: JSON.stringify(changes) }, conn)
}

const waitForGuideChannels = async ({ http, conn, feedChannels, report, pollMs, limitMs, now }) => {
  const wanted = new Set(feedChannels.map((f) => f.id))
  const startedAt = now()
  for (;;) {
    const module = await findUrlGrabber({ http, conn })
    const present = (await listGuideChannels({ http, conn }))
      .filter((g) => g.moduleId === module?.key && wanted.has(g.xmltvId))
    report({ found: present.length, expected: wanted.size })
    if (present.length >= wanted.size) return present
    if (now() - startedAt >= limitMs) {
      if (present.length) return present
      throw new GuideError('TVHeadend did not load the guide.', 'download-timeout')
    }
    await sleep(pollMs)
  }
}

const listGuideChannels = async ({ http, conn }) => {
  const body = await http.get('epggrab/channel/grid', { limit: GRID_LIMIT }, conn)
  return (body?.entries || []).map((g) => ({
    id: g.uuid,
    moduleId: g.modid,
    xmltvId: g.id,
    name: g.name || '',
    channels: g.channels || [],
  }))
}

const listTvChannels = async ({ http, conn }) => {
  const body = await http.get('channel/grid', { limit: GRID_LIMIT }, conn)
  return (body?.entries || [])
    .filter((c) => c.enabled !== false)
    .map((c) => ({
      id: c.uuid,
      name: c.name || '',
      number: Number(c.number) || null,
      services: c.services || [],
      guide: c.epggrab || [],
    }))
}

const listServiceLcns = async ({ http, conn }) => {
  const body = await http.get('mpegts/service/grid', { limit: GRID_LIMIT }, conn)
  return new Map((body?.entries || []).filter((s) => Number(s.lcn) > 0).map((s) => [s.uuid, Number(s.lcn)]))
}

const isLinked = ({ channel, guideChannels }) => linkedGuideIds({ channel, guideChannels }).length > 0

const linkedGuideIds = ({ channel, guideChannels }) => guideChannels
  .filter((g) => g.channels.includes(channel.id) || channel.guide?.includes(g.id))
  .map((g) => g.id)

const sameMembers = (a, b) => a.length === b.length && a.every((id) => b.includes(id))

const guideChannelOptions = (guideChannels, counts = null) => guideChannels
  .map((g) => ({
    id: g.id,
    name: g.name,
    ...(g.feed?.lcn ? { number: g.feed.lcn } : {}),
    ...(counts && !counts.get(g.xmltvId) ? { empty: true } : {}),
  }))
  .sort((a, b) => Number(Boolean(a.empty)) - Number(Boolean(b.empty)) || a.name.localeCompare(b.name))

const changedLinks = ({ links, channels, guideChannels }) => {
  const byId = new Map(channels.map((c) => [c.id, c]))
  return links.filter((l) => !sameMembers(
    linkedGuideIds({ channel: byId.get(l.channelId), guideChannels }),
    l.guideId ? [l.guideId] : [],
  ))
}

const dropChannelListings = ({ http, conn, channelId }) => http.post('idnode/save', {
  node: JSON.stringify({ uuid: channelId, epgauto: false, epg_parent: NOT_A_CHANNEL }),
}, conn)

const countChannelEvents = async ({ http, conn, channelId }) =>
  Number((await http.get('epg/events/grid', { channel: channelId, limit: 1 }, conn))?.totalCount) || 0

const tallyProgrammeStream = ({ stream, nowMs }) => new Promise((resolve, reject) => {
  const counts = new Map()
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    const cut = pending.lastIndexOf(PROGRAMME_TAG)
    if (cut < 0) pending = pending.slice(-PROGRAMME_TAG.length)
    if (cut <= 0) return
    countUpcomingProgrammes({ xml: pending.slice(0, cut), nowMs, counts })
    pending = pending.slice(cut)
  })
  stream.on('end', () => resolve(countUpcomingProgrammes({ xml: pending, nowMs, counts })))
  stream.on('error', reject)
})

const resultWithin = ({ promise, ms }) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => resolve(null), ms)
  timer.unref?.()
  promise.then(
    (value) => { clearTimeout(timer); resolve(value) },
    (err) => { clearTimeout(timer); reject(err) },
  )
})

const feedNames = (g) => [g.name, ...(g.feed?.names || [])].filter(Boolean)

const commonTokens = (names) => {
  const counts = new Map()
  for (const name of names) {
    for (const token of new Set(tokens(name))) counts.set(token, (counts.get(token) || 0) + 1)
  }
  const minimum = Math.max(COMMON_TOKEN_MIN, names.length * COMMON_TOKEN_SHARE)
  const common = [...counts].filter(([t, n]) => n >= minimum && /^[a-z]+$/.test(t)).map(([t]) => t)
  return new Set([...ALWAYS_NOISE, ...common])
}

const normaliseName = ({ name, noise }) => {
  const all = tokens(name)
  const kept = all.filter((t) => !noise.has(t))
  return (kept.length ? kept : all).join('')
}

const guessByName = ({ key, candidates }) =>
  onlyId(candidates.filter((g) => feedNames(g).some((n) => looseKey(n) === key)))

const guessBySibling = ({ key, linked }) => {
  const guideIds = new Set(linked.filter((c) => looseKey(c.name) === key).map((c) => c.guideId))
  return guideIds.size === 1 ? [...guideIds][0] : null
}

const guessByNetwork = ({ key, candidates }) => {
  const network = NETWORK_KEYS[key]
  if (!network) return null
  return onlyId(candidates.filter((g) => feedNames(g).some((n) => NETWORK_KEYS[looseKey(n)] === network)))
}

const onlyId = (matches) => (matches.length === 1 ? matches[0].id : null)

const linkedChannels = ({ channels, guideChannels, links }) => channels
  .map((c) => {
    const added = links.filter((l) => l.channelId === c.id).map((l) => l.guideId)
    const guideIds = added.length ? added : linkedGuideIds({ channel: c, guideChannels })
    return { name: c.name, guideId: guideIds.length === 1 ? guideIds[0] : null }
  })
  .filter((c) => c.guideId)

const isTimeshiftName = (name) => TIMESHIFT_NAME.test(String(name).trim())

const timeshiftHours = (name) => Number(String(name).trim().match(TIMESHIFT_NAME)?.[1]) || 0

const timeshiftBaseName = (name) => String(name).trim().replace(TIMESHIFT_NAME, '').trim()

const feedCarries = ({ channel, feedChannels }) => feedChannels.some((f) =>
  (channel.number && f.lcn === channel.number) || f.names.some((n) => looseKey(n) === looseKey(channel.name)))

const linkedFeedChannels = ({ channels, guideChannels }) => {
  const xmltvIds = new Map(guideChannels.map((g) => [g.id, g.xmltvId]))
  return linkedChannels({ channels, guideChannels, links: [] })
    .map((c) => ({ name: c.name, guideId: xmltvIds.get(c.guideId) }))
}

const looseKey = (name) => {
  const all = tokens(name).filter((t) => !LOOSE_NOISE.has(t))
  const withoutRegion = all.length > 1 && REGION_WORDS.has(all.at(-1)) ? all.slice(0, -1) : all
  return withoutRegion.join('')
}

const tokens = (name) => String(name)
  .toLowerCase()
  .replace(/([a-z0-9])(hd)\b/g, '$1 $2')
  .split(/[^a-z0-9]+/)
  .filter(Boolean)

const readUntil = ({ stream, marker, maxBytes }) => new Promise((resolve, reject) => {
  let text = ''
  const finish = () => {
    stream.destroy()
    resolve(text)
  }
  stream.on('data', (chunk) => {
    text += chunk.toString('utf8')
    if (text.includes(marker) || text.length >= maxBytes) finish()
  })
  stream.on('end', () => resolve(text))
  stream.on('error', reject)
})

const decodeEntities = (value) => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')

const createProgress = ({ steps, onProgress }) => {
  const state = steps.map((s) => ({ id: s.id, label: s.label, status: 'pending', detail: null }))
  const update = (id, patch) => {
    const step = state.find((s) => s.id === id)
    if (step) Object.assign(step, patch)
    onProgress(snapshot())
  }
  const snapshot = () => state.map((s) => ({ ...s }))
  return {
    start: (id) => update(id, { status: 'running' }),
    done: (id) => update(id, { status: 'done' }),
    fail: (id) => update(id, { status: 'failed' }),
    detail: (id, detail) => update(id, { detail }),
    steps: snapshot,
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const URL_GRABBER_TITLE = /XMLTV URL grabber/i
const XMLTV_PRIORITY = 3
const ALWAYS_NOISE = ['hd', 'the', 'channel', 'tv']
const COMMON_TOKEN_MIN = 3
const COMMON_TOKEN_SHARE = 0.25
const TIMESHIFT_NAME = /\+\s*(\d+)\s*(hd)?$/i
const TIMESHIFT_ID_SUFFIX = '.plus'
const LOOSE_NOISE = new Set(['hd', 'the', 'channel'])
const NETWORK_KEYS = {
  abc: 'abc',
  abctv: 'abc',
  seven: 'seven',
  7: 'seven',
  nine: 'nine',
  9: 'nine',
  ten: 'ten',
  10: 'ten',
  sbs: 'sbs',
  sbsone: 'sbs',
}
const REGION_WORDS = new Set([
  'sydney', 'melbourne', 'brisbane', 'adelaide', 'perth', 'hobart', 'darwin', 'canberra',
  'auckland', 'wellington', 'christchurch',
])
const GRID_LIMIT = 5000
const POLL_MS = 3000
const DOWNLOAD_LIMIT_MS = 5 * 60_000
const FEED_REQUEST_LIMIT_MS = 150_000
const FEED_TIMEOUT_MS = 30_000
const FEED_HEAD_BYTES = 2 * 1024 * 1024
const PROGRAMME_TAG = '<programme'
const GZIP_URL = /\.gz(?:$|\?)/i
const PROGRAMME_COUNT_TTL_MS = 30 * 60_000
const PROGRAMME_COUNT_WAIT_MS = 10_000
const NOT_A_CHANNEL = 'none'
const LISTINGS_POLL_MS = 3000
const LISTINGS_LIMIT_MS = 5 * 60_000
const countFeedProgrammes = createProgrammeCounter()
