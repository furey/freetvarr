export const HEALTH_LEVELS = ['ok', 'warn', 'fail']

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

export const healthLabelOf = ({ level, sentence }) => (level === 'ok' ? 'All good' : sentence)

const rankOf = (level) => HEALTH_LEVELS.indexOf(level)

const failingRecordingsSentence = (count) => (count === 1
  ? 'A recording is failing.'
  : `${count} recordings are failing.`)
