export const SIMULCAST_START_TOLERANCE_MS = 2 * 60 * 1000

export const isHdChannelName = (name = '') =>
  /(^|[^A-Za-z])hd($|[^A-Za-z])/i.test(name) || /HD($|[^A-Za-z])/.test(name)

export const isHdChannel = (channel) =>
  typeof channel.hd === 'boolean' ? channel.hd : isHdChannelName(channel.name)

export const isSimulcastHd = (channel) => channel.hd === true || isHdChannelName(channel.name)

export const simulcastBaseKey = (name) => simulcastTokens(name)
  .map((token) => SIMULCAST_ALIASES[token] || token)
  .join('')

export const sdSimulcastIds = (channels) => new Set(simulcastPairsOf(channels)
  .flat()
  .filter((channel) => !isSimulcastHd(channel))
  .map((channel) => String(channel.id)))

export const channelFormatsOf = ({ channels = [], hideSdSimulcasts = false, hideSdChannels = false }) =>
  (hideSdSimulcasts || hideSdChannels
    ? new Map()
    : new Map(channels.map((channel) => [String(channel.id), isSimulcastHd(channel) ? 'HD' : 'SD'])))

export const findHdSimulcast = ({ program, channelId, channels = [], programsByChannel = {}, needsSeriesLink = false }) => {
  const pressed = channels.find((c) => String(c.id) === String(channelId))
  if (!pressed || !program || isHdChannel(pressed)) return null
  const title = normaliseTitle(program.title)
  if (!title) return null
  const matches = channels
    .filter((c) => String(c.id) !== String(channelId) && isHdChannel(c))
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

export const timeshiftOf = (name) => {
  const tokens = simulcastTokens(name)
  const shifted = tokens.map((token) => TIMESHIFT_TOKEN.exec(token))
  const index = shifted.findIndex(Boolean)
  if (index < 0) return null
  const [, stem, hours] = shifted[index]
  const baseTokens = [...tokens.slice(0, index), ...(stem && !SIMULCAST_NOISE.has(stem) ? [stem] : []), ...tokens.slice(index + 1)]
  const baseKey = baseTokens.map((token) => SIMULCAST_ALIASES[token] || token).join('')
  return baseKey ? { baseKey, offsetMs: Number(hours) * HOUR_MS } : null
}

const TIMESHIFT_TOKEN = /^([a-z0-9]*)\+(\d)$/

const HOUR_MS = 60 * 60 * 1000

const SIMULCAST_ALIASES = { nine: '9', seven: '7', ten: '10' }

const SIMULCAST_NOISE = new Set(['hd', 'channel'])

const simulcastTokens = (name) => (name || '')
  .replace(/([A-Za-z0-9])HD\b/g, '$1 ')
  .toLowerCase()
  .split(/[^a-z0-9+]+/)
  .filter((token) => token && !SIMULCAST_NOISE.has(token))

export const simulcastPairsOf = (channels) => {
  const groups = new Map()
  for (const channel of channels) {
    const key = simulcastBaseKey(channel.name)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(channel)
  }
  return [...groups.values()].filter((group) => group.some(isSimulcastHd) && !group.every(isSimulcastHd))
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
