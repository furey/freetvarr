import { syncTook } from './sync-when.js'

export const syncDetail = (summary) => {
  const s = summary || {}
  const items = (s.items || []).map(itemLine)
  return {
    trigger: TRIGGER_LABELS[s.trigger] || s.trigger || '',
    items,
    omitted: s.itemsOmitted || 0,
    countsOnly: !s.items && Boolean(s.imported || s.failed),
    steps: stepLines(s),
    errors: items.length ? [] : (s.errors || []),
    message: s.message || '',
  }
}

export const sxe = ({ season, episode }) => {
  if (season == null && episode == null) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${season != null ? `S${pad(season)}` : ''}${episode != null ? `E${pad(episode)}` : ''}`
}

const itemLine = (item) => ({
  id: item.id,
  outcome: item.outcome,
  outcomeLabel: item.outcome === 'imported' ? 'IMPORTED' : 'FAILED',
  title: item.title,
  episode: [sxe(item), item.episodeTitle].filter(Boolean).join(' · '),
  kind: KIND_LABELS[item.kind] || '',
  channel: item.channel || '',
  airedAt: item.airedAt || null,
  durationMins: item.durationS ? Math.round(item.durationS / 60) : null,
  size: item.size || null,
  ads: adsLine(item.ads),
  took: item.ms != null ? syncTook(item.ms) : '',
  removedFromTvh: Boolean(item.removedFromTvh),
  error: item.error || '',
})

const adsLine = (ads) => {
  if (!ads) return ''
  const minutes = Math.round((ads.adSeconds || 0) / 60)
  if (ads.status === 'cut') return `ads cut (${minutes} min)`
  if (ads.status === 'detected') return `ads found (${minutes} min)`
  if (ads.status === 'detect_failed' || ads.status === 'cut_failed') return 'ad scan failed'
  return ''
}

const stepLines = (s) => {
  const steps = s.steps || {}
  return Object.keys(STEP_LABELS)
    .filter((key) => steps[key] != null || resultOf({ s, key }))
    .map((key) => {
      const result = resultText({ key, result: resultOf({ s, key }) })
      return {
        key,
        label: STEP_LABELS[key],
        text: [result?.text, steps[key] != null ? syncTook(steps[key]) : ''].filter(Boolean).join(' · '),
        ok: result?.ok ?? true,
      }
    })
}

const resultOf = ({ s, key }) => s[RESULT_FIELDS[key]] || null

const resultText = ({ key, result }) => {
  if (!result) return null
  const done = key === 'removals' ? `removed ${result.removed?.length ?? 0}` : 'refreshed'
  if (result.triggered) return { text: done, ok: true }
  if (result.skipped) return { text: `skipped${result.reason ? `: ${result.reason}` : ''}`, ok: true }
  if (result.error) return { text: `failed: ${result.error}`, ok: false }
  return null
}

const RESULT_FIELDS = { plexTv: 'plex', plexOneOffs: 'plexOneOffs', plexMovies: 'plexMovies', removals: 'delete' }

const TRIGGER_LABELS = {
  cron: 'Scheduled sync',
  manual: 'Manual sync',
  'manual-single': 'Manual single-series sync',
  'manual:import': 'Manual import',
}

const KIND_LABELS = { tv: 'series', oneOff: 'one-off', film: 'film' }

const STEP_LABELS = {
  list: 'Read TVHeadend',
  imports: 'Import files',
  plexTv: 'Refresh Plex TV',
  plexOneOffs: 'Refresh Plex one-offs',
  plexMovies: 'Refresh Plex movies',
  removals: 'Remove from TVHeadend',
  libraryCheck: 'Check library',
}
