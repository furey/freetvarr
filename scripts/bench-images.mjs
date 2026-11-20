import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NETWORK_GUARD = path.join(REPO_ROOT, 'scripts', 'demo-pack', 'network-guard.mjs')
const SERVER_PORT = Number(process.env.BENCH_PORT || 3811)
const CHANNELS = 40
const TITLES = 40
const FIRST_DAY = -1
const LAST_DAY = 7
const SLOT_MINUTES = 60
const AIRING_WIDTH = 384
const SHOW_WIDTHS = [384, 768]
const PARALLEL = 6
const IDLE_MS = 8000
const SETTLE_LIMIT_MS = 6 * 60 * 1000
const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

const main = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-bench-images-'))
  const upstream = await startFakeTvheadend()
  const env = await prepareDatabase({ dir, tvhPort: upstream.port })
  try {
    await settleOnce({ env, upstream })
    await fs.rm(path.join(dir, 'config', 'image-cache'), { recursive: true, force: true })
    const results = []
    await withServer({ env, run: async () => {
      const day = await guideDayOf()
      results.push(await pass({ name: 'airings cold', urls: day.airingUrls, upstream }))
      results.push(await pass({ name: 'airings warm', urls: day.airingUrls, upstream }))
      for (const width of SHOW_WIDTHS) results.push(await pass({ name: `shows ${width} cold`, urls: showUrlsOf({ titles: day.titles, width }), upstream }))
      for (const width of SHOW_WIDTHS) results.push(await pass({ name: `shows ${width} warm`, urls: showUrlsOf({ titles: day.titles, width }), upstream }))
    } })
    await withServer({ env, run: async () => {
      const day = await guideDayOf()
      results.push(await pass({ name: 'airings after restart', urls: day.airingUrls, upstream }))
      for (const width of SHOW_WIDTHS) results.push(await pass({ name: `shows ${width} after restart`, urls: showUrlsOf({ titles: day.titles, width }), upstream }))
    } })
    printResults(results)
  } finally {
    upstream.server.close()
    await fs.rm(dir, { recursive: true, force: true })
  }
}

const settleOnce = ({ env, upstream }) => withServer({ env, run: async () => {
  await guideDayOf()
  const started = Date.now()
  let seen = upstream.count()
  let quietSince = Date.now()
  while (Date.now() - quietSince < IDLE_MS && Date.now() - started < SETTLE_LIMIT_MS) {
    await sleep(1000)
    if (upstream.count() !== seen) quietSince = Date.now()
    seen = upstream.count()
  }
  console.log(`settled after ${Math.round((Date.now() - started) / 1000)} s and ${seen} upstream image requests`)
} })

const pass = async ({ name, urls, upstream }) => {
  const before = upstream.count()
  const started = performance.now()
  const timings = await inParallel({ items: urls, limit: PARALLEL, run: timedFetch })
  const totalMs = performance.now() - started
  const served = timings.filter((timing) => timing.ok).length
  return { name, requests: urls.length, served, upstream: upstream.count() - before, totalMs, p50: percentile(timings, 0.5), p95: percentile(timings, 0.95) }
}

const timedFetch = async (url) => {
  const started = performance.now()
  const response = await fetch(`${baseUrl()}${url}`)
  await response.arrayBuffer()
  return { ok: response.ok, ms: performance.now() - started }
}

const guideDayOf = async () => {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const guide = await fetch(`${baseUrl()}/api/epg/guide?day=1`).then((res) => res.json()).catch(() => null)
    const programmes = Object.values(guide?.programs ?? guide?.programsByChannel ?? {}).flat()
    const withImages = programmes.filter((programme) => programme.has_image)
    if (withImages.length) {
      return {
        airingUrls: withImages.map((programme) => `/api/epg/image/${programme.program_id}?w=${AIRING_WIDTH}`),
        titles: [...new Set(withImages.map((programme) => programme.title))],
      }
    }
    await sleep(1000)
  }
  throw new Error('the guide never loaded')
}

const showUrlsOf = ({ titles, width }) => titles.map((title) => `/api/epg/show-image?title=${encodeURIComponent(title)}&w=${width}`)

const withServer = async ({ env, run }) => {
  const child = spawn(process.execPath, ['--import', NETWORK_GUARD, 'src/server.js'], { cwd: REPO_ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] })
  try {
    await waitForHealth()
    await run()
  } finally {
    child.kill('SIGTERM')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await fetch(`${baseUrl()}/healthz`).then((res) => res.ok).catch(() => false)) return
    await sleep(1000)
  }
  throw new Error('the server did not start')
}

const prepareDatabase = async ({ dir, tvhPort }) => {
  await fs.mkdir(path.join(dir, 'config'), { recursive: true })
  await fs.mkdir(path.join(dir, 'recordings'), { recursive: true })
  const env = {
    ...process.env,
    DB_PATH: path.join(dir, 'config', 'state.db'),
    PORT: String(SERVER_PORT),
    CSRF_SECRET: 'bench-images-secret-0000000000000000',
    RECORDINGS_ROOT: path.join(dir, 'recordings'),
    MEDIA_ROOT: path.join(dir, 'recordings'),
    TZ: 'Europe/London',
  }
  const migrated = spawnSync('npx', ['--no-install', 'knex', 'migrate:latest'], { cwd: REPO_ROOT, env, stdio: 'ignore' })
  if (migrated.status !== 0) throw new Error('migrations failed')
  const settings = {
    tvh_url: `http://127.0.0.1:${tvhPort}`,
    tvh_username: 'bench',
    tvh_password: 'bench',
    sync_cron: '0 0 31 2 *',
    time_zone: 'Europe/London',
    show_artwork_lookup: 'false',
    credits_lookup_enabled: 'false',
    reviews_lookup_enabled: 'false',
  }
  const script = `
    import knex from 'knex'
    import config from './knexfile.js'
    const db = knex(config)
    for (const [key, value] of Object.entries(${JSON.stringify(settings)})) await db('settings').insert({ key, value }).onConflict('key').merge()
    await db.destroy()`
  const seeded = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: REPO_ROOT, env, stdio: 'inherit' })
  if (seeded.status !== 0) throw new Error('settings seed failed')
  return env
}

const startFakeTvheadend = async () => {
  const events = guideEventsOf(Date.now())
  const channels = Array.from({ length: CHANNELS }, (_, index) => ({ uuid: channelUuidOf(index), enabled: true, name: `Bench ${index + 1}`, number: index + 1, services: [] }))
  const images = new Map()
  let imageRequests = 0
  const answer = (url) => {
    const route = url.pathname.replace(/^\/api\//, '')
    if (route === 'serverinfo') return { sw_version: '4.3-2794', api_version: 19, name: 'Tvheadend', capabilities: [] }
    if (route === 'channel/grid') return grid(channels, url)
    if (route === 'epg/events/grid') return grid(events, url)
    if (route === 'epg/events/load') return { entries: events.filter((event) => String(event.eventId) === url.searchParams.get('eventId')) }
    return { entries: [], total: 0, totalCount: 0 }
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fake-tvh')
    if (url.pathname.startsWith('/img/')) {
      imageRequests += 1
      const id = Number(path.basename(url.pathname, '.jpg'))
      if (!images.has(id)) images.set(id, await pictureOf(id))
      res.writeHead(200, { 'content-type': 'image/jpeg' })
      return res.end(images.get(id))
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(answer(url)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, port: server.address().port, count: () => imageRequests }
}

const guideEventsOf = (nowMs) => {
  const dayStart = Math.floor(nowMs / DAY_MS) * DAY_MS
  const events = []
  let eventId = 5_000_000
  for (let channel = 0; channel < CHANNELS; channel += 1) {
    for (let start = dayStart + FIRST_DAY * DAY_MS; start < dayStart + (LAST_DAY + 1) * DAY_MS; start += SLOT_MINUTES * MINUTE_MS) {
      const id = eventId++
      events.push({
        eventId: id,
        channelUuid: channelUuidOf(channel),
        channelName: `Bench ${channel + 1}`,
        title: `Bench Show ${((channel * 7 + id) % TITLES) + 1}`,
        start: start / 1000,
        stop: (start + SLOT_MINUTES * MINUTE_MS) / 1000,
        image: `img/${id}.jpg`,
      })
    }
  }
  return events.sort((a, b) => a.start - b.start)
}

const pictureOf = (id) => {
  const width = 32
  const height = 18
  const pixels = Buffer.alloc(width * height * 3)
  let seed = id
  for (let at = 0; at < pixels.length; at += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    pixels[at] = seed % 256
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).resize({ width: 1280, height: 720, kernel: 'nearest' }).jpeg({ quality: 90 }).toBuffer()
}

const grid = (entries, url) => {
  const start = Number(url.searchParams.get('start') || 0)
  const limit = Number(url.searchParams.get('limit') || entries.length)
  return { entries: entries.slice(start, start + limit), total: entries.length, totalCount: entries.length }
}

const channelUuidOf = (index) => `bench${String(index).padStart(27, '0')}`

const inParallel = async ({ items, limit, run }) => {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const at = next++
      results[at] = await run(items[at])
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return results
}

const percentile = (timings, share) => {
  const sorted = timings.map((timing) => timing.ms).sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
}

const printResults = (results) => {
  console.log('pass                       requests  served  upstream  total ms  p50 ms  p95 ms')
  for (const row of results) {
    console.log([
      row.name.padEnd(26),
      String(row.requests).padStart(8),
      String(row.served).padStart(7),
      String(row.upstream).padStart(9),
      row.totalMs.toFixed(0).padStart(9),
      row.p50.toFixed(1).padStart(7),
      row.p95.toFixed(1).padStart(7),
    ].join(' '))
  }
}

const baseUrl = () => `http://127.0.0.1:${SERVER_PORT}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await main()
