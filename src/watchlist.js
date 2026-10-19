import { db } from './db.js'
import { getGuideSnapshot, getChannelPrefs, orderChannels, recordSeries } from './epg.js'
import {
  guideMatchesFor,
  inGuideCountOf,
  recordTargetOf,
  seenThroughFrom,
  watchKeyOf,
  watchlistItemOf,
  watchModeFrom,
  watchRowChangesFor,
  watchTitleFrom,
} from './watchlist-items.js'

const WATCHLIST_SWEEP_MS = 15 * 60 * 1000
const passThrough = (req, res, next) => next()

export const mountWatchlist = ({ app, csrf, limiter = passThrough, onSeriesCreated = async () => {} }) => {
  const sweeper = createRecordSweeper({ onSeriesCreated })

  app.get('/api/watchlist', async (req, res) => {
    try {
      await sweeper.sweep()
      res.json(await listWatchlist({ includeFulfilled: req.query.all === '1' }))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/watchlist', limiter, csrf, async (req, res) => {
    const { title: rawTitle, mode: rawMode, channel_id: rawChannelId } = req.body || {}
    const title = watchTitleFrom(rawTitle)
    const mode = watchModeFrom(rawMode)
    if (!title) return res.status(400).json({ error: 'title is required (up to 200 characters)' })
    if (!mode) return res.status(400).json({ error: "mode must be 'notify' or 'record'" })
    const channelId = rawChannelId == null || rawChannelId === '' ? null : String(rawChannelId)
    try {
      const key = watchKeyOf(title)
      const existing = await db('watchlist').where({ title_key: key }).first()
      if (existing) {
        await db('watchlist').where({ id: existing.id })
          .update(watchRowChangesFor({ existing, mode, channelId: rawChannelId === undefined ? undefined : channelId }))
      } else {
        await db('watchlist').insert({ title, title_key: key, mode, channel_id: channelId })
      }
      if (mode === 'record') await sweeper.sweep()
      const item = await itemByKey(key)
      res.status(existing ? 200 : 201).json({ ok: true, item })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.patch('/api/watchlist/:id', limiter, csrf, async (req, res) => {
    const { mode: rawMode, seen_through: rawSeenThrough } = req.body || {}
    const existing = await db('watchlist').where({ id: Number(req.params.id) }).first()
    if (!existing) return res.status(404).json({ error: 'watchlist entry not found' })
    const changes = {}
    if (rawMode !== undefined) {
      const mode = watchModeFrom(rawMode, null)
      if (!mode) return res.status(400).json({ error: "mode must be 'notify' or 'record'" })
      Object.assign(changes, watchRowChangesFor({ existing, mode }))
    }
    if (rawSeenThrough !== undefined) {
      const seenThrough = seenThroughFrom(rawSeenThrough)
      if (seenThrough == null) return res.status(400).json({ error: 'seen_through must be epoch milliseconds' })
      changes.seen_through = seenThrough
    }
    try {
      if (Object.keys(changes).length) await db('watchlist').where({ id: existing.id }).update(changes)
      if (changes.mode === 'record') await sweeper.sweep()
      res.json({ ok: true, item: await itemByKey(existing.title_key) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.delete('/api/watchlist/:id', csrf, async (req, res) => {
    const removed = await db('watchlist').where({ id: Number(req.params.id) }).delete()
    if (!removed) return res.status(404).json({ error: 'watchlist entry not found' })
    res.json({ ok: true })
  })

  setInterval(() => { sweeper.sweep() }, WATCHLIST_SWEEP_MS).unref()
  return sweeper
}

export const listWatchlist = async ({ includeFulfilled = false } = {}) => {
  const rows = await db('watchlist').orderBy('created_at', 'asc').orderBy('id', 'asc')
  const guide = await visibleGuide()
  const items = rows
    .filter((row) => includeFulfilled || !row.fulfilled_at)
    .map((row) => watchlistItemOf({ row, matches: matchesFor({ row, guide }) }))
  return { items, inGuide: inGuideCountOf(items) }
}

const itemByKey = async (key) => {
  const row = await db('watchlist').where({ title_key: key }).first()
  return row ? watchlistItemOf({ row, matches: matchesFor({ row, guide: await visibleGuide() }) }) : null
}

const createRecordSweeper = ({ onSeriesCreated }) => {
  let inflight = null
  const run = async () => {
    const rows = await db('watchlist').where({ mode: 'record' }).whereNull('fulfilled_at')
    if (!rows.length) return
    const guide = await visibleGuide()
    for (const row of rows) {
      const target = recordTargetOf({ row, matches: matchesFor({ row, guide }) })
      if (target) await fulfil({ row, target, onSeriesCreated })
    }
  }
  const sweep = () => {
    inflight ??= run()
      .catch((err) => console.warn(`[watchlist] record sweep failed: ${err.message}`))
      .finally(() => { inflight = null })
    return inflight
  }
  return { sweep }
}

const fulfil = async ({ row, target, onSeriesCreated }) => {
  const result = await recordSeries({
    seriesLink: target.series_link,
    channelId: target.channelId,
    epgProgramId: target.epg_program_id,
    programId: target.program_id,
    anyChannel: true,
  })
  await db('watchlist').where({ id: row.id })
    .update({ fulfilled_at: db.fn.now(), series_link_id: result.seriesLinkId ?? null })
  await Promise.resolve(onSeriesCreated(result)).catch((err) =>
    console.warn(`[watchlist] show rule for "${result.title}" failed: ${err.message}`))
  console.log(`[watchlist] "${row.title}" is in the guide; set an any-channel series recording`)
}

const visibleGuide = async () => {
  try {
    const [guide, prefs] = await Promise.all([getGuideSnapshot(), getChannelPrefs()])
    const channels = orderChannels({ channels: guide.channels, ...prefs }).filter((channel) => !channel.hidden)
    return { channels, programsByChannel: guide.programsByChannel }
  } catch {
    return null
  }
}

const matchesFor = ({ row, guide }) => (guide
  ? guideMatchesFor({
    titleKey: row.title_key,
    channelId: row.channel_id,
    channels: guide.channels,
    programsByChannel: guide.programsByChannel,
    nowMs: Date.now(),
  })
  : [])
