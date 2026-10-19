import { ref } from '/vendor/vue.esm-browser.prod.js'
import { worstHealthOf } from '/health-page.js'
import { healthLevelOf } from '/health-level.js'
import { api, fetchSettings } from '/shared/api.js'
import { recordingNow } from '/shared/recording-now.js'

export const health = ref({ level: 'ok', sentence: null, known: false })

export const healthSummary = ref(null)

export const pollHealth = async ({ fresh = false } = {}) => {
  clearTimeout(healthTimer)
  health.value = { ...(await currentHealth({ fresh })), known: true }
  healthTimer = setTimeout(() => pollHealth(), HEALTH_POLL_MS)
}

const currentHealth = async ({ fresh }) => {
  const summary = await api('GET', `/api/health-summary${fresh ? '?fresh=1' : ''}`).catch(() => null)
  if (!summary) return healthFromFallbackSources()
  healthSummary.value = summary
  return worstHealthOf(
    { level: summary.level, sentence: summary.sentence },
    healthLevelOf({ failingRecordings: failingRecordingCount() }),
  )
}

const healthFromFallbackSources = async () => {
  const settings = await fetchSettings().catch(() => ({}))
  const tvhConfigured = Boolean(settings.tvh_url)
  const [syncs, guideState] = await Promise.all([
    api('GET', '/api/syncs?pageSize=1').catch(() => null),
    tvhConfigured
      ? api('GET', '/api/epg/state').then((state) => ({ state }), () => ({ failed: true }))
      : {},
  ])
  return healthLevelOf({
    tvhConfigured,
    guideState: guideState.state ?? null,
    guideStateFailed: Boolean(guideState.failed),
    lastSync: syncs?.syncs?.find((sync) => sync.status !== 'running') ?? null,
    failingRecordings: failingRecordingCount(),
  })
}

const failingRecordingCount = () => recordingNow.value.active.filter((entry) => entry.failed).length

let healthTimer = null

const HEALTH_POLL_MS = 60_000

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && health.value.known) pollHealth()
})
