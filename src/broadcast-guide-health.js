import { SCORE_WINDOW_HOURS, MIN_HORIZON_HOURS, medianOf, scoreListings } from './guide-source-health.js'

export const MIN_LISTED_SHARE = 0.5

export const broadcastGuideHealthOf = ({ guide, nowMs = Date.now() }) => {
  const channels = (guide?.channels ?? []).filter((channel) => !channel.radio)
  if (!channels.length) return null
  const scores = channels.map((channel) => scoreListings({
    programmes: (guide.programsByChannel?.[String(channel.epgId)] ?? []).map(scoredProgrammeOf),
    nowMs,
  }))
  const listed = scores.filter((score) => score.coveredHours > 0)
  const upcoming = scores.reduce((sum, score) => sum + score.counts.upcoming, 0)
  const described = scores.reduce((sum, score) => sum + score.counts.described, 0)
  const horizonHours = listed.length ? medianOf(listed.map((score) => score.horizonHours)) : 0
  const listedShare = listed.length / channels.length
  return {
    channels: channels.length,
    listed: listed.length,
    coveredShare: round(scores.reduce((sum, score) => sum + score.coveredHours, 0) / (channels.length * SCORE_WINDOW_HOURS)),
    horizonDays: round(horizonHours / 24),
    describedShare: upcoming ? round(described / upcoming) : null,
    short: listedShare < MIN_LISTED_SHARE || horizonHours < MIN_HORIZON_HOURS,
  }
}

const scoredProgrammeOf = (programme) => ({
  start: programme.start,
  stop: programme.end,
  title: programme.title,
  desc: programme.synopsis || programme.episode_title || null,
})

const round = (value) => Math.round(value * 10) / 10
