import { JOB_KINDS } from './activity.js'

export const ACTIVITY_STREAM_PATH = '/activity/stream'
export const ACTIVITY_PUSH_MS = 500
export const ACTIVITY_HEARTBEAT_MS = 15_000
export const SERVER_FACTS_TTL_MS = 15_000

export const mountActivityRoutes = ({
  app,
  activity,
  listSessions = () => [],
  loadRecordings = async () => [],
  loadServer = async () => ({}),
  pushMs = ACTIVITY_PUSH_MS,
  heartbeatMs = ACTIVITY_HEARTBEAT_MS,
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
    const push = () => send(`event: jobs\ndata: ${JSON.stringify(jobsPayloadOf(activity))}\n\n`)
    const pushLater = throttle({ run: push, waitMs: pushMs })
    const unsubscribe = activity.subscribe(pushLater.call)
    const heartbeat = setInterval(() => send(': ping\n\n'), heartbeatMs)
    heartbeat.unref?.()
    push()
    req.on('close', () => {
      unsubscribe()
      pushLater.cancel()
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
