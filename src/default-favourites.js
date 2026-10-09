export const BIG_FIVE = [
  { id: 'abc', hdNumbers: [20], sdNumbers: [2, 21] },
  { id: 'seven', hdNumbers: [7, 6, 70, 60, 71, 61], sdNumbers: [] },
  { id: 'nine', hdNumbers: [90, 80, 9, 8], sdNumbers: [91, 81] },
  { id: 'ten', hdNumbers: [10, 50, 5, 15], sdNumbers: [1, 11, 51] },
  { id: 'sbs', hdNumbers: [30], sdNumbers: [3] },
]

export const pickBigFive = (channels = []) => {
  const candidates = channels.filter((c) => !isTimeShifted(c.name) && !c.offAir)
  const taken = new Set()
  return BIG_FIVE.flatMap((network) => {
    const best = candidates
      .map((channel) => ({ channel, rank: rankFor({ channel, network }) }))
      .filter(({ channel, rank }) => rank && !taken.has(String(channel.id)))
      .sort((a, b) => compareRanks(a.rank, b.rank))[0]
    if (!best) return []
    taken.add(String(best.channel.id))
    return [best.channel]
  })
}

export const applyDefaultFavourites = async ({ country, listChannels, getChannelPrefs, setChannelPrefs, getSetting, setSetting }) => {
  if (country !== 'au') return []
  if (await getSetting(APPLIED_SETTING)) return []
  const { pinnedIds } = await getChannelPrefs()
  if (pinnedIds.length) return []
  const picked = pickBigFive(await listChannels())
  if (!picked.length) return []
  await setChannelPrefs({ pinnedIds: picked.map((c) => String(c.id)) })
  await setSetting(APPLIED_SETTING, '1')
  return picked.map(({ id, name }) => ({ id: String(id), name }))
}

export const APPLIED_SETTING = 'default_favourites_applied'

export const networkForName = (name = '') => {
  const words = brandWords(name)
  if (!words.length || words.slice(1).some((w) => SUB_CHANNEL_WORDS.has(w))) return null
  return NAME_BRANDS.get(words[0]) ?? null
}

const rankFor = ({ channel, network }) => {
  const named = networkForName(channel.name)
  if (named && named !== network.id) return null
  if (!named && isSubChannel(channel.name)) return null
  const number = Number(channel.number)
  const hdIndex = network.hdNumbers.indexOf(number)
  const sdIndex = network.sdNumbers.indexOf(number)
  if (hdIndex < 0 && sdIndex < 0 && !named) return null
  return {
    hdService: channel.hd === true,
    hdName: isHdName(channel.name),
    hdNumber: hdIndex >= 0,
    numberOrder: numberOrder({ network, hdIndex, sdIndex }),
    named: Boolean(named),
  }
}

const numberOrder = ({ network, hdIndex, sdIndex }) => {
  if (hdIndex >= 0) return hdIndex
  if (sdIndex >= 0) return network.hdNumbers.length + sdIndex
  return Infinity
}

const compareRanks = (a, b) =>
  Number(b.hdService) - Number(a.hdService)
  || Number(b.hdName) - Number(a.hdName)
  || Number(b.hdNumber) - Number(a.hdNumber)
  || a.numberOrder - b.numberOrder
  || Number(b.named) - Number(a.named)

const isTimeShifted = (name = '') => /\+\s*\d/.test(name)

const isHdName = (name = '') => /(^|[^a-z])hd($|[^a-z])/i.test(name) || /\dHD/i.test(name)

const isSubChannel = (name = '') => brandWords(name).some((w) => SUB_CHANNEL_WORDS.has(w))

const brandWords = (name) => name
  .replace(/([0-9])HD\b/gi, '$1 ')
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter((w) => w && w !== 'hd' && w !== 'channel' && w !== 'the')

const NAME_BRANDS = new Map([
  ['abc', 'abc'],
  ['abctv', 'abc'],
  ['sbs', 'sbs'],
  ['7', 'seven'],
  ['seven', 'seven'],
  ['prime7', 'seven'],
  ['gwn7', 'seven'],
  ['9', 'nine'],
  ['nine', 'nine'],
  ['nbn', 'nine'],
  ['10', 'ten'],
  ['ten', 'ten'],
  ['sc10', 'ten'],
  ['win', 'nine'],
  ['wow', 'nine'],
])

const SUB_CHANNEL_WORDS = new Set([
  'two', 'mate', 'flix', 'bravo', 'gem', 'go', 'life', 'rush', 'extra',
  'comedy', 'drama', 'peach', 'bold', 'shake', 'nickelodeon',
  'kids', 'family', 'me', 'entertains', 'news', 'plus', 'australia',
  'viceland', 'food', 'movies', 'world', 'worldwatch', 'nitv', 'sbs2',
])
