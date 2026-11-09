import { JOB_KINDS } from './activity.js'

export const ACTIVITY_STREAM_PATH = '/activity/stream'
export const ACTIVITY_PUSH_MS = 500
export const ART_PUSH_MS = 2000
export const STREAM_TOPICS = ['jobs', 'art']
export const ACTIVITY_HEARTBEAT_MS = 15_000
export const SERVER_FACTS_TTL_MS = 15_000

export const mountActivityRoutes = ({
  app,
  activity,
  listSessions = () => [],
  loadRecordings = async () => [],
  loadServer = async () => ({}),
  pushMs = ACTIVITY_PUSH_MS,
  artPushMs = ART_PUSH_MS,
  heartbeatMs = ACTIVITY_HEARTBEAT_MS,
  artFeed = null,
}) => {
  app.get('/api/activity', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const [recordings, server] = await Promise.all([
      loadRecordings().catch(() => []),
      loadServer().catch(() => ({})),
    ])
    res.json({ ...jobsPayloadOf(activity), recordings, sessions: listSessions(), server })
  })

  app.get('/api/activity/summary', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ running: busyCountOf(activity.snapshot().running) })
  })

  app.get(`/api${ACTIVITY_STREAM_PATH}`, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const send = (text) => {
      res.write(text)
      res.flush?.()
    }
    const topics = streamTopicsOf(req.query.topics)
    const stops = [
      topics.has('jobs') && streamJobs({ activity, send, pushMs }),
      topics.has('art') && artFeed && streamArt({ artFeed, send, since: req.query.since, pushMs: artPushMs }),
    ].filter(Boolean)
    const heartbeat = setInterval(() => send(': ping\n\n'), heartbeatMs)
    heartbeat.unref?.()
    req.on('close', () => {
      stops.forEach((stop) => stop())
      clearInterval(heartbeat)
    })
  })

  app.get('/api/activity/:id', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const run = activity.get(String(req.params.id))
    if (!run) return res.status(404).json({ error: 'That job is no longer in the activity list.' })
    res.json(run)
  })
}

export const streamTopicsOf = (value) => {
  if (value == null || value === '') return new Set(['jobs'])
  return new Set(String(value).split(',').filter((topic) => STREAM_TOPICS.includes(topic)))
}

const streamJobs = ({ activity, send, pushMs }) => {
  const push = () => send(`event: jobs\ndata: ${JSON.stringify(jobsPayloadOf(activity))}\n\n`)
  const pushLater = throttle({ run: push, waitMs: pushMs })
  const unsubscribe = activity.subscribe(pushLater.call)
  push()
  return () => {
    unsubscribe()
    pushLater.cancel()
  }
}

const streamArt = ({ artFeed, send, since, pushMs }) => {
  let cursor = since ? String(since) : artFeed.cursor()
  const push = ({ always = false } = {}) => {
    const batch = artFeed.since(cursor)
    cursor = batch.cursor
    if (!always && !batch.reset && !batch.stamps.length) return
    send(`event: art\ndata: ${JSON.stringify(batch)}\n\n`)
  }
  const pushLater = batchFor({ run: push, waitMs: pushMs })
  const unsubscribe = artFeed.subscribe(pushLater.call)
  push({ always: true })
  return () => {
    unsubscribe()
    pushLater.cancel()
  }
}

export const jobsPayloadOf = (activity) => {
  const { running, upNext, recent } = activity.snapshot()
  return { running, upNext, recent, runningCount: busyCountOf(running) }
}

export const busyCountOf = (running = []) => running.filter((run) => !JOB_KINDS[run.kind]?.quiet).length

export const recordingRowsOf = (recordingNow) => (recordingNow?.active ?? []).map((recording) => ({
  id: `recording-${recording.dvrUuid}`,
  dvrUuid: recording.dvrUuid,
  title: recording.title,
  episodeTitle: recording.episodeTitle ?? null,
  season: recording.season ?? null,
  episode: recording.episode ?? null,
  channelName: recording.channelName ?? null,
  start: recording.start ?? null,
  stop: recording.stop ?? null,
  stopPadded: recording.stopPadded ?? null,
  recordingStartedAt: recording.recordingStartedAt ?? null,
  failed: Boolean(recording.failed),
  statusText: recording.statusText ?? null,
  filesize: recording.filesize ?? null,
  tuner: recording.tuner ?? null,
}))

export const cachedFor = ({ load, ttlMs = SERVER_FACTS_TTL_MS, now = Date.now }) => {
  let cache = null
  let inflight = null
  return () => {
    if (cache && now() - cache.at < ttlMs) return Promise.resolve(cache.value)
    inflight ??= Promise.resolve()
      .then(load)
      .then((value) => {
        cache = { at: now(), value }
        return value
      })
      .finally(() => { inflight = null })
    return inflight
  }
}

const throttle = ({ run, waitMs }) => {
  let timer = null
  let lastAt = 0
  const fire = () => {
    timer = null
    lastAt = Date.now()
    run()
  }
  return {
    call: () => {
      if (timer) return
      const wait = Math.max(0, lastAt + waitMs - Date.now())
      timer = setTimeout(fire, wait)
    },
    cancel: () => {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

const batchFor = ({ run, waitMs }) => {
  let timer = null
  return {
    call: () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        run()
      }, waitMs)
    },
    cancel: () => {
      clearTimeout(timer)
      timer = null
    },
  }
}
