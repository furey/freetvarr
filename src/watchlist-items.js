import { showKeyOf } from './web/show-key.js'

export const WATCH_MODES = ['notify', 'record']
export const WATCHLIST_MATCH_CAP = 20
export const WATCH_TITLE_MAX_LENGTH = 200

export const watchModeFrom = (value, fallback = 'notify') => {
  if (value == null) return fallback
  return WATCH_MODES.includes(value) ? value : null
}

export const watchTitleFrom = (value) => {
  const title = typeof value === 'string' ? value.trim() : ''
  return title && title.length <= WATCH_TITLE_MAX_LENGTH ? title : null
}

export const seenThroughFrom = (value) => {
  const ms = Number(value)
  return value != null && Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null
}

export const watchKeyOf = (title) => showKeyOf(title)

export const guideMatchesFor = ({
  titleKey,
  channelId = null,
  channels = [],
  programsByChannel = {},
  nowMs,
  cap = WATCHLIST_MATCH_CAP,
}) => {
  const wantedChannel = channelId == null || channelId === '' ? null : String(channelId)
  return channels
    .filter((channel) => wantedChannel == null || String(channel.id) === wantedChannel)
    .flatMap((channel) => (programsByChannel[String(channel.epgId ?? channel.id)] || [])
      .filter((program) => program.end > nowMs && showKeyOf(program.title) === titleKey)
      .map((program) => ({ ...browserProgramOf(program), channelId: channel.id, channelName: channel.name })))
    .sort((a, b) => a.start - b.start)
    .slice(0, cap)
}

export const watchlistItemOf = ({ row, matches = [] }) => ({
  id: row.id,
  title: row.title,
  key: row.title_key,
  mode: row.mode,
  channelId: row.channel_id ?? null,
  createdAt: row.created_at ?? null,
  fulfilledAt: row.fulfilled_at ?? null,
  seriesLinkId: row.series_link_id ?? null,
  matches,
  nextMatch: matches[0] ?? null,
  unseen: matches.filter((match) => match.start > Number(row.seen_through ?? 0)).length,
})

export const recordTargetOf = ({ row, matches = [] }) => {
  if (row.mode !== 'record' || row.fulfilled_at) return null
  return matches.find((match) => match.series_link) ?? null
}

export const inGuideCountOf = (items) =>
  items.filter((item) => item.mode === 'notify' && !item.fulfilledAt && item.matches.length > 0).length

export const watchRowChangesFor = ({ existing, mode, channelId }) => {
  const changes = { mode }
  if (channelId !== undefined) changes.channel_id = channelId
  if (existing.mode !== mode || mode === 'notify') changes.fulfilled_at = null
  if (mode === 'notify') changes.series_link_id = null
  return changes
}

const browserProgramOf = ({ image, ...program }) => ({ ...program, has_image: Boolean(image) })
