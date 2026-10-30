import { getRecordingState, listGuideChannels } from './epg.js'
import { holdersByInput, tunerVerdict } from './live-tv.js'
import { getTunerStatus, isOffAir, listServiceMuxes, listSubscriptions, resolveConnection } from './tvheadend.js'
import { isTvheadendUnconfigured } from './tvheadend-unconfigured.js'

export const describeTuners = ({ inputs = [], subscriptions = [], tunerCount }) => {
  const tuned = inputs.filter((i) => i.mux)
  const total = Math.max(tunerCount ?? 0, tuned.length)
  const busy = tuned.map((input) => describeTuned({ input, subscriptions }))
  const free = Array.from({ length: total - busy.length }, () => ({ name: null, inUseBy: null, label: 'Free' }))
  return {
    total,
    inUse: busy.length,
    recording: busy.filter((t) => t.inUseBy === 'recording').length,
    free: free.length,
    tuners: [...busy, ...free],
  }
}

export const channelCosts = ({ channels = [], muxes = new Map(), inputs = [], subscriptions = [], tunerCount, recordings = [], now }) => {
  const muxOf = (channel) => muxes.get(channel?.serviceIds?.[0])?.muxName || null
  const muxById = new Map(channels.map((c) => [String(c.id), muxOf(c)]))
  const conflictRecordings = recordings.map((r) => ({ ...r, mux: muxById.get(String(r.channelId)) ?? null }))
  return channels.map((channel) => {
    if (isOffAir({ serviceIds: channel.serviceIds || [], services: muxes })) {
      return { channelId: channel.id, cost: 'unavailable', reason: 'off-air', conflict: null }
    }
    const verdict = tunerVerdict({
      channelMux: muxOf(channel), inputs, tunerCount, recordings: conflictRecordings, now,
    })
    if (!verdict.ok) return { channelId: channel.id, cost: 'unavailable', reason: 'no-tuner', conflict: verdict.conflict }
    const sharesWith = verdict.via === 'shared' ? sharedChannelName({ mux: muxOf(channel), inputs, subscriptions }) : null
    return { channelId: channel.id, cost: COSTS[verdict.via], reason: null, conflict: verdict.conflict, ...(sharesWith && { sharesWith }) }
  })
}

export const sharedChannelName = ({ mux, inputs = [], subscriptions = [] }) => {
  const input = inputs.find((i) => i.mux === mux)
  if (!input) return null
  return subscriptions.find((s) => s.service?.startsWith(`${input.input}/`) && s.channel)?.channel ?? null
}

export const recordingsForConflicts = (futureRecordings = []) => futureRecordings.map((r) => ({
  name: r.name,
  channelId: r.channelId,
  start: r.paddedStartDate ?? r.startDate,
  end: r.paddedEndDate ?? r.endDate,
  running: r.schedStatus === 'recording',
}))

export const unconfiguredTunerStatus = ({ streams }) => ({
  configured: false, total: 0, inUse: 0, recording: 0, free: 0, muxSharing: false, tuners: [], streams, channels: [],
})

export const loadTunerStatus = async ({ streams, now = Date.now() }) => {
  const conn = await resolveConnection()
  const [channels, muxes, status, subscriptions, state] = await Promise.all([
    listGuideChannels(),
    listServiceMuxes(conn).catch(() => new Map()),
    getTunerStatus(conn),
    listSubscriptions(conn).catch(() => []),
    getRecordingState().catch(() => ({ futureRecordings: [] })),
  ])
  const inputs = holdersByInput({ inputs: status.inputs, subscriptions })
  return {
    configured: true,
    ...describeTuners({ inputs: status.inputs, subscriptions, tunerCount: status.tunerCount }),
    muxSharing: muxes.size > 0,
    streams,
    channels: channelCosts({
      channels,
      muxes,
      inputs,
      subscriptions,
      tunerCount: status.tunerCount,
      recordings: recordingsForConflicts(state.futureRecordings),
      now,
    }),
  }
}

export const mountTunerStatus = ({ app, streams, onTunerCount = () => {}, onError }) => {
  app.get('/api/live/tuner-status', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const report = await loadTunerStatus({ streams: streams() })
      onTunerCount(report.total)
      res.json(report)
    } catch (err) {
      if (isTvheadendUnconfigured(err)) return res.json(unconfiguredTunerStatus({ streams: streams() }))
      onError(res, err, 'tuner status')
    }
  })
}

const describeTuned = ({ input, subscriptions }) => {
  const holders = subscriptions.filter((s) => s.service.startsWith(`${input.input}/`))
  const recording = holders.find((s) => DVR_TITLE.test(s.title))
  if (recording) {
    return { name: input.input, inUseBy: 'recording', label: `Recording ${recording.title.replace(DVR_TITLE, '')}` }
  }
  const watched = holders.find((s) => s.channel)
  return { name: input.input, inUseBy: 'live', label: watched ? `Watching ${watched.channel}` : 'In use' }
}

const COSTS = { shared: 'no-extra-tuner', idle: 'free-tuner' }
const DVR_TITLE = /^DVR:\s*/
