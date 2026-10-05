export const SIMULCAST_START_TOLERANCE_MS = 2 * 60 * 1000

export const isHdChannelName = (name = '') =>
  /(^|[^A-Za-z])hd($|[^A-Za-z])/i.test(name) || /HD($|[^A-Za-z])/.test(name)

export const findHdSimulcast = ({ program, channelId, channels = [], programsByChannel = {}, needsSeriesLink = false }) => {
  const pressed = channels.find((c) => String(c.id) === String(channelId))
  if (!pressed || !program || isHdChannelName(pressed.name)) return null
  const title = normaliseTitle(program.title)
  if (!title) return null
  const matches = channels
    .filter((c) => String(c.id) !== String(channelId) && isHdChannelName(c.name))
    .map((channel) => ({
      channel,
      program: (programsByChannel[channel.id] || []).find((p) =>
        normaliseTitle(p.title) === title
        && Math.abs(p.start - program.start) <= SIMULCAST_START_TOLERANCE_MS
        && (!needsSeriesLink || p.series_link)),
    }))
    .filter((m) => m.program)
  if (!matches.length) return null
  const pressedTokens = nameTokens(pressed.name)
  return matches
    .map((m) => ({ ...m, score: tokenOverlap(pressedTokens, nameTokens(m.channel.name)) }))
    .sort((a, b) => b.score - a.score)
    .map(({ channel, program: hdProgram }) => ({ channel, program: hdProgram }))[0]
}

const normaliseTitle = (title) => (title || '').trim().toLowerCase()

const nameTokens = (name) => new Set(
  (name || '')
    .replace(/([A-Za-z0-9])HD\b/g, '$1 ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t !== 'hd'),
)

const tokenOverlap = (a, b) => {
  const shared = [...a].filter((t) => b.has(t)).length
  const total = new Set([...a, ...b]).size
  return total ? shared / total : 0
}
