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

export const applyGuideLinks = async ({ http, conn, links, guideChannels }) => {
  const saves = planGuideRelinks({ guideChannels, links })
  for (const { guideId, channels } of saves) {
    await http.post('idnode/save', { node: JSON.stringify({ uuid: guideId, channels }) }, conn)
  }
  if (saves.length) await http.post('epggrab/internal/rerun', { rerun: 1 }, conn)
  return { linked: new Set(links.filter((l) => l.guideId).map((l) => l.channelId)).size, saved: saves.length }
}

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
  onProgress = () => {},
  pollMs = POLL_MS,
  limitMs = DOWNLOAD_LIMIT_MS,
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
    const feedChannels = await run('feed', async () => {
      const module = await findUrlGrabber({ http, conn })
      if (!module) throw new GuideError('This TVHeadend has no guide download by URL.', 'no-grabber')
      const listed = await fetchFeed(url).catch((err) => {
        throw new GuideError(`Freetvarr could not download the guide (${err.message}).`, 'feed-unreachable')
      })
      if (!listed.length) throw new GuideError('The guide address returned no channels.', 'feed-empty')
      await enableGrabber({ http, conn, module, url })
      await keepGuideSaved({ http, conn })
      await http.post('epggrab/internal/rerun', { rerun: 1 }, conn)
      return listed
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
      const linked = linkedChannels({ channels, guideChannels, links: matched.links })
      return {
        linked: linkedIds.size + alreadyLinked.length,
        total: channels.length,
        unmatched: matched.unmatched.map(({ id, name, number }) => ({
          id,
          name,
          number,
          guess: guessGuideChannel({ channel: { name }, candidates, linked }),
        })),
        options: guideChannelOptions(guideChannels),
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

export const readGuideLinks = async ({ http, conn }) => {
  const inspection = await inspectGuide({ http, conn })
  return {
    channels: inspection.channels.map((c) => ({
      id: c.id,
      name: c.name,
      number: c.number,
      guideIds: linkedGuideIds({ channel: c, guideChannels: inspection.guideChannels }),
    })),
    options: guideChannelOptions(inspection.guideChannels),
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
  return applyGuideLinks({ http, conn, links: valid, guideChannels })
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

const guideChannelOptions = (guideChannels) => guideChannels
  .map((g) => ({ id: g.id, name: g.name }))
  .sort((a, b) => a.name.localeCompare(b.name))

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
const TIMESHIFT_NAME = /\+\s*\d+\s*(hd)?$/i
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
const FEED_TIMEOUT_MS = 30_000
const FEED_HEAD_BYTES = 2 * 1024 * 1024
