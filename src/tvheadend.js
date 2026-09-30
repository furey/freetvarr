import os from 'os'
import axios from 'axios'

import { getSetting, setSetting } from './db.js'
import { authorizationFor, createChallengeCache } from './http-auth.js'

export class TvheadendError extends Error {
  constructor(message, { stage, status, code } = {}) {
    super(message)
    this.name = 'TvheadendError'
    this.stage = stage
    this.status = status
    this.code = code
  }
}

export const testConnection = async ({ url, username, password, persist = true } = {}) => {
  const conn = await resolveConnection({ url, username, password })
  const info = await apiGet('serverinfo', {}, conn)
  const [channels, inputs] = await Promise.all([
    listChannels(conn),
    listInputs(conn).catch(() => []),
  ])
  if (persist) {
    if (url !== undefined) await setSetting('tvh_url', conn.url)
    if (username !== undefined) await setSetting('tvh_username', conn.username)
    if (password) await setSetting('tvh_password', conn.password)
  }
  return {
    ok: true,
    version: info?.sw_version || '',
    apiVersion: info?.api_version ?? null,
    channels: channels.length,
    tuners: inputs.length,
  }
}

export const detectServers = async ({ hintAddress, env = process.env } = {}) => {
  const envUrl = (env.TVH_URL || '').trim().replace(/\/+$/, '')
  if (envUrl) {
    return { ok: true, source: 'env', candidates: [{ url: envUrl, version: '', needsAuth: false, loopback: false }] }
  }
  const urls = rankCandidates({ interfaces: os.networkInterfaces(), hintAddress })
  const probes = await Promise.all(urls.map(probeServer))
  const candidates = preferLanOverLoopback(probes.filter(Boolean))
  if (!candidates.length) {
    return {
      ok: false,
      source: 'probe',
      candidates: [],
      reason: 'No TVHeadend answered on port 9981 at any address of this host.',
    }
  }
  return { ok: true, source: 'probe', candidates }
}

export const rankCandidates = ({ interfaces = {}, hintAddress = '', port = DEFAULT_PORT } = {}) => {
  const hint = normaliseAddress(hintAddress)
  const hostAddresses = Object.values(interfaces)
    .flat()
    .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
    .map((i) => i.address)
    .filter((a) => !isDockerBridge(a) && !isLinkLocal(a))
    .sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)))
  const ordered = [
    ...(hint && !isLoopback(hint) ? [hint] : []),
    ...hostAddresses,
    'tvheadend',
    'host.docker.internal',
    '127.0.0.1',
  ]
  return [...new Set(ordered)].map((host) => `http://${host}:${port}`)
}

export const listChannels = async (conn) => {
  const [body, epgIconsByChannel] = await Promise.all([
    apiGet('channel/grid', { limit: 1000, sort: 'number', dir: 'ASC' }, conn),
    listEpgIconsByChannel(conn).catch(() => new Map()),
  ])
  return (body?.entries || [])
    .filter((c) => c.enabled !== false)
    .map((c) => ({
      id: c.uuid,
      epgId: c.uuid,
      number: channelNumber(c.number),
      name: c.name || '',
      description: '',
      hd: /hd$/i.test((c.name || '').trim()),
      recordable: true,
      logos: channelLogoSources({ channel: c, epgIcons: epgIconsByChannel.get(c.uuid) }),
      serviceIds: c.services || [],
    }))
}

export const indexEpgIconsByChannel = (epgChannels = []) => {
  const index = new Map()
  for (const e of epgChannels) {
    if (!e.icon) continue
    for (const channelId of e.channels || []) {
      index.set(channelId, [...(index.get(channelId) || []), e.icon])
    }
  }
  return index
}

export const channelLogoSources = ({ channel, epgIcons = [] }) =>
  [...new Set([channel.icon_public_url, ...epgIcons].filter(Boolean))]

export const listEvents = async ({ startMs, endMs, conn } = {}) => {
  const events = []
  for (let offset = 0; ; offset += EVENT_PAGE_SIZE) {
    const body = await apiGet('epg/events/grid', {
      start: offset,
      limit: EVENT_PAGE_SIZE,
      sort: 'start',
      dir: 'ASC',
    }, conn)
    const page = body?.entries || []
    for (const e of page) {
      const start = e.start * 1000
      const end = e.stop * 1000
      if (end <= startMs) continue
      if (start >= endMs) return events
      events.push(normaliseEvent(e))
    }
    if (page.length < EVENT_PAGE_SIZE) return events
  }
}

export const getEvent = async ({ eventId, conn } = {}) => {
  const body = await apiGet('epg/events/load', { eventId }, conn)
  const raw = body?.entries?.[0]
  return raw ? normaliseEvent(raw) : null
}

export const listUpcoming = async (conn) => {
  const body = await apiGet('dvr/entry/grid_upcoming', { limit: 1000 }, conn)
  return (body?.entries || []).map(normaliseEntry)
}

export const listFinished = async (conn) => {
  const body = await apiGet('dvr/entry/grid_finished', { limit: 5000 }, conn)
  return (body?.entries || []).map(normaliseEntry)
}

export const listAutorecs = async (conn) => {
  const body = await apiGet('dvr/autorec/grid', { limit: 1000 }, conn)
  return (body?.entries || []).map((a) => ({
    id: a.uuid,
    seriesLinkId: seriesKey({ channelId: a.channel, title: a.title }),
    name: a.title || a.name || '',
    channelId: a.channel || '',
    enabled: a.enabled !== false,
    leadTime: a.start_extra ?? 0,
    lagTime: a.stop_extra ?? 0,
    episodesToKeep: a.maxcount ?? 0,
  }))
}

export const scheduleRecording = async ({
  programId,
  leadTime = DEFAULT_LEAD_MINUTES,
  lagTime = DEFAULT_LAG_MINUTES,
} = {}) => {
  const conn = await resolveConnection()
  const body = await apiPost('dvr/entry/create_by_event', {
    event_id: programId,
    config_uuid: await defaultDvrConfig(conn),
    comment: CREATOR_TAG,
  }, conn)
  const uuid = Array.isArray(body?.uuid) ? body.uuid[0] : body?.uuid
  if (!uuid) {
    throw new TvheadendError('TVHeadend did not return a recording uuid.', { stage: 'record', code: 'no-uuid' })
  }
  await apiPost('idnode/save', {
    node: JSON.stringify({ uuid, start_extra: leadTime, stop_extra: lagTime }),
  }, conn)
  return { ok: true, uuid, programId }
}

export const cancelRecording = async ({ programId } = {}) => {
  const conn = await resolveConnection()
  const entry = (await listUpcoming(conn)).find((e) => String(e.programId) === String(programId))
  if (!entry) {
    throw new TvheadendError('No scheduled recording for that programme.', { stage: 'cancel', code: 'not-found' })
  }
  const action = entry.schedStatus === 'recording' ? 'stop' : 'cancel'
  await apiPost(`dvr/entry/${action}`, { uuid: entry.uuid }, conn)
  await apiPost('dvr/entry/remove', { uuid: entry.uuid }, conn).catch(() => null)
  return { ok: true, uuid: entry.uuid, programId }
}

export const enableSeriesTag = async ({
  seriesLink,
  channelId,
  title,
  leadTime = DEFAULT_LEAD_MINUTES,
  lagTime = DEFAULT_LAG_MINUTES,
  episodesToKeep = 0,
} = {}) => {
  const conn = await resolveConnection()
  const existing = (await listAutorecs(conn)).find((a) => a.seriesLinkId === seriesLink)
  if (existing) return { ok: true, uuid: existing.id, seriesLinkId: seriesLink, existed: true }
  const body = await apiPost('dvr/autorec/create', {
    conf: JSON.stringify({
      enabled: true,
      name: title,
      title,
      fulltext: false,
      channel: channelId,
      start: 'Any',
      start_window: 'Any',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      pri: 2,
      record: DUPLICATE_DETECTION_EPISODE_NUMBER,
      start_extra: leadTime,
      stop_extra: lagTime,
      maxcount: episodesToKeep,
      config_name: await defaultDvrConfig(conn),
      comment: CREATOR_TAG,
    }),
  }, conn)
  if (!body?.uuid) {
    throw new TvheadendError('TVHeadend did not return an autorec uuid.', { stage: 'series', code: 'no-uuid' })
  }
  return { ok: true, uuid: body.uuid, seriesLinkId: seriesLink }
}

export const disableSeriesTag = async ({ seriesLinkId } = {}) => {
  const conn = await resolveConnection()
  const autorec = (await listAutorecs(conn)).find((a) => a.seriesLinkId === seriesLinkId || a.id === seriesLinkId)
  if (!autorec) {
    throw new TvheadendError('No series recording matches.', { stage: 'series', code: 'not-found' })
  }
  await apiPost('idnode/delete', { uuid: autorec.id }, conn)
  return { ok: true, uuid: autorec.id, seriesLinkId: autorec.seriesLinkId }
}

export const deleteRecordings = async ({ recordingIds } = {}) => {
  const ids = (recordingIds || []).map(String).filter(Boolean)
  if (ids.length === 0) {
    throw new TvheadendError('No recordingIds provided.', { stage: 'delete', code: 'no-ids' })
  }
  const conn = await resolveConnection()
  const known = new Set((await listFinished(conn)).map((e) => e.uuid))
  const deleted = []
  const unknown = []
  for (const id of ids) {
    if (!known.has(id)) {
      unknown.push(id)
      continue
    }
    await apiPost('dvr/entry/remove', { uuid: id }, conn)
    deleted.push(id)
  }
  if (deleted.length === 0) {
    throw new TvheadendError(
      `Recording(s) not in TVHeadend's finished list: ${unknown.join(', ')}.`,
      { stage: 'delete', code: 'not-found' },
    )
  }
  return { ok: true, deleted, unknown }
}

export const getState = async () => {
  const conn = await resolveConnection()
  const [upcoming, autorecs, inputs, tuners] = await Promise.all([
    listUpcoming(conn),
    listAutorecs(conn),
    listInputs(conn).catch(() => []),
    countTuners(conn).catch(() => null),
  ])
  const keyByAutorecId = new Map(autorecs.map((a) => [a.id, a.seriesLinkId]))
  const futureRecordings = upcoming.map((e) => ({
    ...e,
    seriesLinkId: e.autorecId ? keyByAutorecId.get(e.autorecId) || null : null,
  }))
  return {
    futureRecordings,
    seriesTags: autorecs,
    activeRecordingIds: futureRecordings
      .filter((e) => e.schedStatus === 'recording' && e.programId != null)
      .map((e) => e.programId),
    activeInputs: inputs,
    tunerCount: tuners,
  }
}

export const getTunerStatus = async (conn) => {
  const c = conn || (await resolveConnection())
  const [inputs, tunerCount] = await Promise.all([
    listInputs(c),
    countTuners(c).catch(() => null),
  ])
  return { inputs, tunerCount: tunerCount ?? inputs.length }
}

export const listServiceMuxes = async (conn) => {
  if (serviceMuxCache && serviceMuxCache.expiresAt > Date.now()) return serviceMuxCache.value
  const body = await apiGet('mpegts/service/grid', { limit: 10000 }, conn)
  const value = new Map((body?.entries || []).map((s) => [s.uuid, {
    muxId: s.multiplex_uuid,
    muxName: muxDisplayName({ multiplex: s.multiplex, network: s.network }),
  }]))
  serviceMuxCache = { value, expiresAt: Date.now() + SERVICE_MUX_TTL_MS }
  return value
}

export const muxDisplayName = ({ multiplex, network }) =>
  network ? `${multiplex} in ${network}` : multiplex

export const getChannelServiceInfo = async ({ serviceId, conn } = {}) => {
  const c = conn || (await resolveConnection())
  const [muxes, body] = await Promise.all([
    listServiceMuxes(c),
    apiGet('service/streams', { uuid: serviceId }, c),
  ])
  return {
    serviceId,
    ...(muxes.get(serviceId) || { muxId: null, muxName: null }),
    streams: normaliseServiceStreams(body?.streams),
  }
}

export const normaliseServiceStreams = (streams = []) =>
  streams
    .filter((s) => s.index != null)
    .map((s) => ({
      pid: s.pid,
      type: s.type,
      language: s.language || '',
      audioType: s.audio_type ?? null,
      height: s.height || null,
    }))

export const getDefaultLanguages = async (conn) => {
  if (languagesCache) return languagesCache
  const c = conn || (await resolveConnection())
  const body = await apiGet('config/load', {}, c)
  const param = (body?.entries?.[0]?.params || []).find((p) => p.id === 'language')
  languagesCache = Array.isArray(param?.value) ? param.value : []
  return languagesCache
}

export const openChannelStream = async ({ channelId, signal, userAgent, conn } = {}) => {
  const c = conn || (await resolveConnection())
  const url = new URL(`${c.url}/stream/channel/${encodeURIComponent(channelId)}`)
  url.searchParams.set('profile', 'pass')
  url.searchParams.set('weight', String(LIVE_STREAM_WEIGHT))
  const res = await sendAuthenticated({
    method: 'get',
    url: url.toString(),
    responseType: 'stream',
    signal,
    timeout: 0,
    headers: { 'User-Agent': userAgent },
  }, c)
  if (res.status === 200) return res.data
  res.data?.destroy?.()
  const code = streamFailureCode(res.status)
  throw new TvheadendError(`TVHeadend refused the stream (HTTP ${res.status}).`, {
    stage: 'stream', status: res.status, code,
  })
}

const streamFailureCode = (status) => {
  if (status === 401 || status === 403) return 'auth'
  if (status === 503) return 'no-tuner'
  return 'http'
}

export const getChannelIcon = async ({ sources = [], conn } = {}) => {
  if (!sources.length) return null
  const c = conn || (await resolveConnection())
  for (const source of sources) {
    const image = await fetchImage({ source, conn: c }).catch(() => null)
    if (image) return image
  }
  return null
}

export const fetchProgrammeImage = async ({ source, conn } = {}) => {
  if (!source) return null
  const c = conn || (await resolveConnection())
  return fetchImage({
    source,
    conn: c,
    timeout: PROGRAMME_IMAGE_TIMEOUT_MS,
    maxBytes: PROGRAMME_IMAGE_MAX_BYTES,
    imagesOnly: true,
  }).catch(() => null)
}

export const getRecordingStorage = async () => {
  const conn = await resolveConnection()
  const body = await apiGet('dvr/config/grid', {}, conn)
  const entries = body?.entries || []
  const chosen = entries.find((c) => c.name === '') || entries[0]
  return chosen?.storage || ''
}

export const seriesKey = ({ channelId, title }) =>
  `${channelId}|${(title || '').trim().toLowerCase()}`

export const resolveConnection = async ({ url, username, password } = {}) => {
  const resolvedUrl = (url ?? (await getSetting('tvh_url')) ?? '').trim().replace(/\/+$/, '')
  if (!resolvedUrl) {
    throw new TvheadendError('TVHeadend URL is not configured.', { stage: 'config', code: 'no-url' })
  }
  const resolvedUser = (username ?? (await getSetting('tvh_username')) ?? '').trim()
  const resolvedPass = password || (await getSetting('tvh_password')) || ''
  return { url: resolvedUrl, username: resolvedUser, password: resolvedPass }
}

const normaliseEvent = (e) => ({
  program_id: e.eventId,
  epg_program_id: e.eventId,
  channel_id: e.channelUuid,
  title: e.title || '',
  episode_title: e.subtitle || null,
  synopsis: e.description || e.summary || '',
  start: e.start * 1000,
  end: e.stop * 1000,
  series_no: e.seasonNumber ?? null,
  episode_no: e.episodeNumber ?? null,
  series_link: seriesKey({ channelId: e.channelUuid, title: e.title }),
  genre: (e.genre || [])[0] ?? null,
  rating: e.ageRating ? String(e.ageRating) : null,
  dvr_state: e.dvrState || null,
  dvr_uuid: e.dvrUuid || null,
  image: e.image || null,
})

const normaliseEntry = (e) => {
  const { season, episode } = parseEpisodeDisp(e.episode_disp)
  return {
    uuid: e.uuid,
    programId: e.broadcast || null,
    name: e.disp_title || '',
    episodeTitle: e.disp_subtitle || null,
    channelId: e.channel || '',
    channelName: e.channelname || null,
    startDate: e.start * 1000,
    endDate: e.stop * 1000,
    paddedStartDate: (e.start_real ?? e.start) * 1000,
    paddedEndDate: (e.stop_real ?? e.stop) * 1000,
    schedStatus: e.sched_status || '',
    statusText: e.status || '',
    autorecId: e.autorec || null,
    filename: e.filename || null,
    filesize: e.filesize ?? null,
    errors: e.errors ?? 0,
    dataErrors: e.data_errors ?? 0,
    season,
    episode,
    pendingDelete: false,
  }
}

const parseEpisodeDisp = (disp) => {
  const m = /Season\s+(\d+)\.?\s*(?:Episode\s+(\d+))?/i.exec(disp || '')
  const em = /Episode\s+(\d+)/i.exec(disp || '')
  return {
    season: m ? Number(m[1]) : null,
    episode: em ? Number(em[1]) : null,
  }
}

export const listInputs = async (conn) => {
  const body = await apiGet('status/inputs', {}, conn)
  return (body?.entries || []).map(normaliseInput)
}

export const normaliseInput = (i) => ({
  uuid: i.uuid || null,
  input: i.input || '',
  stream: i.stream || '',
  mux: i.stream || null,
  subs: i.subs ?? 0,
  subscriptions: i.subs ?? 0,
  ...scaledReading({ value: i.signal, scale: i.signal_scale, key: 'signal', unit: 'dBm' }),
  ...scaledReading({ value: i.snr, scale: i.snr_scale, key: 'snr', unit: 'dB' }),
  bitsPerSecond: i.bps ?? null,
  continuityErrors: i.cc ?? 0,
  transportErrors: i.te ?? 0,
  uncorrectedBlocks: i.unc ?? 0,
})

const scaledReading = ({ value, scale, key, unit }) => {
  if (scale === SCALE_RELATIVE) {
    return { [key]: Math.round((value / RELATIVE_FULL_SCALE) * 100), [`${key}Unit`]: '%' }
  }
  if (scale === SCALE_DECIBEL) return { [key]: value / 1000, [`${key}Unit`]: unit }
  return { [key]: null, [`${key}Unit`]: null }
}

export const listSubscriptions = async (conn) => {
  const body = await apiGet('status/subscriptions', {}, conn)
  return (body?.entries || []).map((s) => ({
    id: s.id,
    title: s.title || '',
    channel: s.channel || '',
    channelName: s.channel || '',
    service: s.service || '',
    client: s.client || '',
    state: s.state || '',
    errors: s.errors ?? 0,
    bytesInPerSecond: s.in ?? null,
    startedAt: (s.start ?? 0) * 1000,
  }))
}

export const listActiveRecordings = async (conn) => {
  const body = await apiGet('dvr/entry/grid_upcoming', { limit: 1000 }, conn)
  return (body?.entries || [])
    .filter((e) => String(e.sched_status || '').startsWith('recording'))
    .map(normaliseRecording)
}

export const listRecentlyEnded = async (conn) => {
  const params = { limit: RECENTLY_ENDED_LIMIT, sort: 'stop_real', dir: 'DESC' }
  const [finished, failed] = await Promise.all([
    apiGet('dvr/entry/grid_finished', params, conn),
    apiGet('dvr/entry/grid_failed', params, conn),
  ])
  return [...(finished?.entries || []), ...(failed?.entries || [])].map(normaliseRecording)
}

export const loadRecording = async ({ uuid, conn }) => {
  const body = await apiGet('idnode/load', { uuid, grid: 1 }, conn)
  const raw = body?.entries?.[0]
  return raw?.uuid ? normaliseRecording(raw) : null
}

export const normaliseRecording = (e) => ({
  ...normaliseEntry(e),
  startPadded: (e.start_real ?? e.start) * 1000,
  stopPadded: (e.stop_real ?? e.stop) * 1000,
  errorCode: e.errorcode ?? 0,
  image: e.image || null,
})

const countTuners = async (conn) => {
  if (tunerCountCache && tunerCountCache.expiresAt > Date.now()) return tunerCountCache.value
  const value = await walkTuners(conn)
  tunerCountCache = { value, expiresAt: Date.now() + TUNER_COUNT_TTL_MS }
  return value
}

const walkTuners = async (conn) => {
  const roots = await apiGet('hardware/tree', { uuid: 'root' }, conn)
  const count = await countLeafNodes(Array.isArray(roots) ? roots : [], conn)
  return count > 0 ? count : null
}

const countLeafNodes = async (nodes, conn) => {
  let count = 0
  for (const node of nodes) {
    if (node.leaf) {
      count += 1
      continue
    }
    const children = await apiGet('hardware/tree', { uuid: node.uuid }, conn)
    count += await countLeafNodes(Array.isArray(children) ? children : [], conn)
  }
  return count
}

let dvrConfigCache = null
let tunerCountCache = null
let serviceMuxCache = null
let languagesCache = null

const defaultDvrConfig = async (conn) => {
  if (dvrConfigCache) return dvrConfigCache
  const body = await apiGet('dvr/config/grid', {}, conn)
  const entries = body?.entries || []
  const chosen = entries.find((c) => c.name === '') || entries[0]
  dvrConfigCache = chosen?.uuid || ''
  return dvrConfigCache
}

const listEpgIconsByChannel = async (conn) => {
  const body = await apiGet('epggrab/channel/grid', { limit: 10000 }, conn)
  return indexEpgIconsByChannel(body?.entries || [])
}

const fetchImage = async ({ source, conn, timeout = REQUEST_TIMEOUT_MS, maxBytes, imagesOnly = false }) => {
  const limits = { timeout, ...(maxBytes ? { maxContentLength: maxBytes } : {}) }
  const res = isAbsoluteUrl(source)
    ? await axios.get(source, { responseType: 'arraybuffer', validateStatus: () => true, ...limits })
    : await sendAuthenticated({
      method: 'get',
      url: `${conn.url}/${source.replace(/^\//, '')}`,
      responseType: 'arraybuffer',
      ...limits,
    }, conn)
  const contentType = String(res.headers['content-type'] || '')
  if (res.status >= 400 || contentType.startsWith('text/')) return null
  if (imagesOnly && !contentType.startsWith('image/')) return null
  return { body: Buffer.from(res.data), contentType: contentType || 'image/png' }
}

const isAbsoluteUrl = (source) => /^https?:\/\//i.test(source)

const channelNumber = (raw) => {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

const apiGet = async (path, params, conn) => {
  const c = conn || (await resolveConnection())
  return request({ method: 'get', path, params, conn: c })
}

const apiPost = async (path, form, conn) => {
  const c = conn || (await resolveConnection())
  return request({ method: 'post', path, form, conn: c })
}

const request = async ({ method, path, params, form, conn }) => {
  let res
  try {
    res = await sendAuthenticated({
      method,
      url: apiUrl({ base: conn.url, path, params }),
      data: form ? new URLSearchParams(form).toString() : undefined,
      headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
    }, conn)
  } catch (err) {
    throw new TvheadendError(
      `TVHeadend request failed: ${err.code || err.message}`,
      { stage: path, code: err.code },
    )
  }
  if (res.status === 401 || res.status === 403) {
    throw new TvheadendError(
      `TVHeadend rejected the credentials (HTTP ${res.status}).`,
      { stage: path, status: res.status, code: 'auth' },
    )
  }
  if (res.status >= 400) {
    throw new TvheadendError(`TVHeadend HTTP ${res.status} on ${path}.`, { stage: path, status: res.status })
  }
  return res.data
}

const sendAuthenticated = async (config, conn) => {
  const send = (headers) => axios({
    ...config,
    headers: { ...config.headers, ...headers },
    timeout: config.timeout ?? REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  })
  const key = `${conn.url}|${conn.username}`
  const sign = (cached) => cached && authorizationFor({
    challenge: cached.challenge,
    nonceCount: cached.nonceCount,
    method: config.method,
    uri: requestUri(config.url),
    username: conn.username,
    password: conn.password,
  })
  const reused = conn.username ? sign(challenges.next(key)) : null
  const first = await send(reused ? { Authorization: reused } : {})
  if (first.status !== 401 || !conn.username) return first
  challenges.remember(key, first.headers['www-authenticate'])
  const authorization = sign(challenges.next(key))
  if (!authorization) return first
  first.data?.destroy?.()
  const second = await send({ Authorization: authorization })
  if (second.status === 401) challenges.forget(key)
  return second
}

const challenges = createChallengeCache()

const apiUrl = ({ base, path, params = {} }) => {
  const url = new URL(`${base}/api/${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

const requestUri = (url) => {
  const { pathname, search } = new URL(url)
  return `${pathname}${search}`
}

const CREATOR_TAG = 'freetvarr'
const EVENT_PAGE_SIZE = 2000
const DEFAULT_PORT = 9981
const PROBE_TIMEOUT_MS = 1500

const probeServer = async (url) => {
  let res
  try {
    res = await axios.get(`${url}/api/serverinfo`, { timeout: PROBE_TIMEOUT_MS, validateStatus: () => true })
  } catch {
    return null
  }
  const loopback = isLoopback(new URL(url).hostname)
  if (res.status === 200 && res.data && typeof res.data === 'object' && 'sw_version' in res.data) {
    return { url, version: res.data.sw_version || '', needsAuth: false, loopback }
  }
  const realm = String(res.headers['www-authenticate'] || '')
  if (res.status === 401 && /tvheadend/i.test(realm)) return { url, version: '', needsAuth: true, loopback }
  return null
}

const preferLanOverLoopback = (found) => {
  const lan = found.filter((c) => !c.loopback)
  return lan.length ? lan : found
}

const normaliseAddress = (address) => String(address || '').replace(/^::ffff:/, '').trim()
const isLoopback = (a) => a === '127.0.0.1' || a === '::1' || a === 'localhost'
const isLinkLocal = (a) => a.startsWith('169.254.')
const isDockerBridge = (a) => /^172\.(1[7-9]|2\d|3[01])\./.test(a)
const isPrivate = (a) =>
  a.startsWith('10.') || a.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a)

const REQUEST_TIMEOUT_MS = 15000
const SCALE_RELATIVE = 1
const SCALE_DECIBEL = 2
const RELATIVE_FULL_SCALE = 65535
const RECENTLY_ENDED_LIMIT = 5
const PROGRAMME_IMAGE_TIMEOUT_MS = 5000
const PROGRAMME_IMAGE_MAX_BYTES = 4 * 1024 * 1024
const TUNER_COUNT_TTL_MS = 10 * 60 * 1000
const SERVICE_MUX_TTL_MS = 10 * 60 * 1000
const LIVE_STREAM_WEIGHT = 50
const DUPLICATE_DETECTION_EPISODE_NUMBER = 1
const DEFAULT_LEAD_MINUTES = 2
const DEFAULT_LAG_MINUTES = 10
