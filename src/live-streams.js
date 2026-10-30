import { runLiveBenchmark } from './live-benchmark.js'
import { getTunerStatus } from './tvheadend.js'

export const MAX_LIVE_STREAMS_KEY = 'max_live_streams'
export const LIVE_BENCHMARK_KEY = 'live_benchmark'
export const PLAYER_STREAM_CHOICES = [1, 2, 3, 4]

export const envStreamCapFrom = (value) => {
  if (value == null || String(value).trim() === '') return null
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 1 ? n : null
}

export const storedStreamsFrom = (value) => {
  const n = Number(value)
  return PLAYER_STREAM_CHOICES.includes(n) ? n : null
}

export const benchmarkFrom = (text) => {
  try {
    const parsed = JSON.parse(text || 'null')
    return Number.isInteger(parsed?.estimated) && parsed.encoder ? parsed : null
  } catch {
    return null
  }
}

export const defaultLiveStreams = ({ cap, benchmark, tunerCount, encoderKind }) => {
  if (cap != null) return cap
  if (benchmark) {
    const tuners = tunerCount > 0 ? tunerCount : Infinity
    return Math.max(1, Math.min(benchmark.estimated, tuners, Math.max(...PLAYER_STREAM_CHOICES)))
  }
  return encoderKind === 'vaapi' ? 2 : 1
}

export const streamChoicesFor = ({ cap, tunerCount }) => {
  const ceiling = Math.min(cap ?? Infinity, tunerCount > 0 ? tunerCount : Infinity)
  const choices = PLAYER_STREAM_CHOICES.filter((n) => n <= ceiling)
  return choices.length ? choices : [PLAYER_STREAM_CHOICES[0]]
}

export const liveStreamLimit = ({ stored, cap, benchmark, tunerCount, encoderKind }) => {
  const fallback = defaultLiveStreams({ cap, benchmark, tunerCount, encoderKind })
  const choices = streamChoicesFor({ cap, tunerCount })
  const effective = stored == null ? fallback : Math.min(stored, cap ?? Math.max(...choices))
  return {
    max_live_streams: effective,
    default: fallback,
    cap,
    choices,
    tuner_count: tunerCount > 0 ? tunerCount : null,
    hardware_transcode: encoderKind === 'vaapi',
    stored,
    benchmark: benchmark || null,
  }
}

export const createLiveStreams = ({
  envValue,
  encoderReady,
  getSetting,
  setSetting,
  readTunerCount = async () => (await getTunerStatus()).tunerCount,
  isBusy = () => false,
  benchmark = runLiveBenchmark,
}) => {
  const cap = envStreamCapFrom(envValue)
  const state = { stored: null, benchmark: null, tunerCount: null, encoderKind: null }
  let running = null

  const describe = () => liveStreamLimit({ ...state, cap })

  const current = () => describe().max_live_streams

  const load = async () => {
    const [stored, saved, encoder] = await Promise.all([
      getSetting(MAX_LIVE_STREAMS_KEY),
      getSetting(LIVE_BENCHMARK_KEY),
      encoderReady,
    ])
    state.stored = storedStreamsFrom(stored)
    state.encoderKind = encoder.kind
    const cached = benchmarkFrom(saved)
    state.benchmark = cached?.encoder === encoder.kind ? cached : null
    state.tunerCount = await readTunerCount().catch(() => null)
    return describe()
  }

  const setStored = async (value) => {
    state.stored = value
    await setSetting(MAX_LIVE_STREAMS_KEY, value == null ? '' : String(value))
    return describe()
  }

  const noteTunerCount = (count) => {
    if (count > 0) state.tunerCount = count
  }

  const measure = async () => {
    if (running) return running
    if (isBusy()) return { skipped: 'busy' }
    running = (async () => {
      const result = await benchmark({ encoder: await encoderReady })
      state.benchmark = result
      await setSetting(LIVE_BENCHMARK_KEY, JSON.stringify(result))
      return { benchmark: result }
    })().finally(() => { running = null })
    return running
  }

  return { describe, current, load, setStored, noteTunerCount, measure, encoderKind: () => state.encoderKind }
}

export const streamCapacity = ({ liveStreams, sessions }) => {
  const { max_live_streams: max, benchmark } = liveStreams.describe()
  return {
    max,
    inUse: sessions.reduce((sum, s) => sum + s.activeCount(), 0),
    estimated: benchmark?.estimated ?? null,
    encoder: benchmark?.encoder ?? liveStreams.encoderKind(),
    speed: benchmark?.speed ?? null,
    measuredAt: benchmark?.measuredAt ?? null,
  }
}

export const mountLiveStreams = ({ app, csrf, limiter, liveStreams }) => {
  app.get('/api/live-streams', (req, res) => {
    res.json(liveStreams.describe())
  })

  app.put('/api/live-streams', csrf, async (req, res) => {
    const value = req.body?.max_live_streams
    const stored = value === null ? null : storedStreamsFrom(value)
    if (value !== null && (stored == null || typeof value !== 'number')) {
      return res.status(400).json({ error: `max_live_streams must be ${PLAYER_STREAM_CHOICES.join(', ')} or null` })
    }
    res.json(await liveStreams.setStored(stored))
  })

  app.post('/api/live/benchmark', limiter, csrf, async (req, res) => {
    try {
      const outcome = await liveStreams.measure()
      if (outcome.skipped) {
        return res.status(409).json({ ok: false, code: 'busy', error: 'Measure again once live TV, playback, and ad scans finish.' })
      }
      res.json({ ok: true, benchmark: outcome.benchmark })
    } catch (err) {
      res.status(500).json({ ok: false, code: 'ffmpeg', error: err.message })
    }
  })
}
