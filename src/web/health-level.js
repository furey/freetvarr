export const HEALTH_LEVELS = ['ok', 'warn', 'fail']

export const HEALTH_ALERT_HIDE_MS = 24 * 60 * 60 * 1000

export const healthLevelOf = ({
  tvhConfigured = true,
  guideState = null,
  guideStateFailed = false,
  lastSync = null,
  failingRecordings = 0,
} = {}) => {
  const findings = [
    !tvhConfigured && { level: 'warn', sentence: 'TVHeadend is not set up yet.' },
    tvhConfigured && guideStateFailed && { level: 'fail', sentence: 'TVHeadend is not answering.' },
    tvhConfigured && !guideStateFailed && guideState?.stale && { level: 'warn', sentence: 'TVHeadend is slow to answer.' },
    failingRecordings > 0 && { level: 'fail', sentence: failingRecordingsSentence(failingRecordings) },
    lastSync?.status === 'error' && { level: 'fail', sentence: 'The last sync failed.' },
    lastSync?.status === 'partial' && { level: 'warn', sentence: 'The last sync had problems.' },
  ].filter(Boolean)
  return findings.reduce(
    (worst, finding) => (rankOf(finding.level) > rankOf(worst.level) ? finding : worst),
    { level: 'ok', sentence: null },
  )
}

export const healthBadgeOf = ({ level, known = true } = {}) => (known && BADGED_LEVELS.includes(level) ? level : null)

export const healthReasonOf = (sentence) => (sentence || '').trim().replace(/\.$/, '')

export const badgedNameOf = ({ label, badge }) => (badge ? `${label}, ${ATTENTION_PHRASES[badge]}` : label)

export const healthRowNameOf = ({ label, badge, sentence }) => {
  if (!badge) return label
  const reason = healthReasonOf(sentence)
  return reason ? `${badgedNameOf({ label, badge })}: ${reason}` : badgedNameOf({ label, badge })
}

export const attentionPhraseOf = (badge) => ATTENTION_PHRASES[badge] ?? ''

export const healthAlertOf = ({ health, dismissal = null, nowMs }) => {
  if (healthBadgeOf(health) !== 'fail') return null
  const sentence = healthReasonOf(health.sentence)
  if (!sentence || isDismissed({ dismissal, sentence, nowMs })) return null
  return { sentence }
}

export const dismissalOf = ({ sentence, nowMs }) => ({ sentence: healthReasonOf(sentence), atMs: nowMs })

export const parseDismissal = (stored) => {
  try {
    const parsed = JSON.parse(stored || 'null')
    return typeof parsed?.sentence === 'string' && Number.isFinite(parsed?.atMs) ? parsed : null
  } catch {
    return null
  }
}

const isDismissed = ({ dismissal, sentence, nowMs }) => dismissal?.sentence === sentence
  && nowMs >= dismissal.atMs
  && nowMs - dismissal.atMs < HEALTH_ALERT_HIDE_MS

const rankOf = (level) => HEALTH_LEVELS.indexOf(level)

const failingRecordingsSentence = (count) => (count === 1
  ? 'A recording is failing.'
  : `${count} recordings are failing.`)

const BADGED_LEVELS = ['warn', 'fail']

const ATTENTION_PHRASES = { warn: 'needs a look', fail: 'needs attention' }
