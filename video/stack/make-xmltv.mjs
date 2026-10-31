import { writeFile } from 'node:fs/promises'
import { CHANNELS, SHOWS, FILMS, LINEUP } from './content.mjs'

const HOST = process.env.MEDIA_HOST || 'http://192.168.86.246:3890'
const OUT = new URL('./host/xmltv.xml', import.meta.url)
const DAY_MS = 86_400_000

const main = async () => {
  const start = startOfToday() - DAY_MS
  const end = start + 9 * DAY_MS
  const episodeCounters = new Map()
  const regular = CHANNELS.flatMap((channel, channelIndex) =>
    scheduleFor({ channel, channelIndex, start, end, episodeCounters }))
  const programmes = withShortRun(regular)
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv generator-info-name="freetvarr-video-demo">',
    ...CHANNELS.map(channelXml),
    ...programmes.map(programmeXml),
    '</tv>',
  ].join('\n')
  await writeFile(OUT, xml)
  console.log(`wrote ${programmes.length} programmes for ${CHANNELS.length} channels`)
}

const scheduleFor = ({ channel, channelIndex, start, end, episodeCounters }) => {
  const lineup = LINEUP[channel.id]
  const slots = []
  let at = start + (channelIndex % 2) * 30 * 60_000
  let i = channelIndex
  while (at < end) {
    const title = lineup[i % lineup.length]
    const minutes = durationOf({ title, at })
    slots.push(programmeFor({ title, channel, at, minutes, episodeCounters }))
    at += minutes * 60_000
    i += 1
  }
  return slots
}

const durationOf = ({ title, at }) => {
  if (FILMS[title]) return 120
  const hour = new Date(at).getHours()
  if (title === 'Morning Stretch') return 30
  if (title === 'Nightline News') return 30
  if (hour >= 18 && hour < 23) return 60
  return [30, 60][Math.floor(at / 1800_000) % 2]
}

const programmeFor = ({ title, channel, at, minutes, episodeCounters }) => {
  const film = FILMS[title]
  if (film) return {
    channel: channel.id, start: at, stop: at + minutes * 60_000, title,
    desc: film.line, category: 'Movie', icon: `${HOST}/hd/${film.image}.jpg`, date: film.year,
  }
  const show = SHOWS[title]
  const n = (episodeCounters.get(title) || 0) + 1
  episodeCounters.set(title, n)
  const image = show.images[n % show.images.length]
  return {
    channel: channel.id, start: at, stop: at + minutes * 60_000, title,
    subTitle: show.season ? `Episode ${n}` : null,
    desc: show.lines[n % show.lines.length],
    category: show.category,
    episode: show.season ? `${show.season - 1}.${n - 1}.` : null,
    icon: `${HOST}/hd/${image}.jpg`,
  }
}

const SHORT_AT = Number(process.env.SHORT_AT || 0)
const SHORT_MIN = 2
const SHORT_RUN = {
  'coastline.demo': ['Big Wave Season', 'Big Wave Season', 'Big Wave Season'],
  'harbour.demo': ['Kitchen Heat', 'Kitchen Heat', 'Kitchen Heat'],
  'southern.demo': ['Wild Neighbours', 'Wild Neighbours'],
  'greenhouse.demo': ['The Weekend Garden', 'The Weekend Garden'],
  'ridgeline.demo': ['Mountain Rangers', 'Mountain Rangers'],
  'bayside.demo': ['Road Trip Rules', 'Road Trip Rules'],
  'nightline.demo': ['Lighthouse at Dusk'],
}

const withShortRun = (programmes) => {
  if (!SHORT_AT) return programmes
  const windowEnd = SHORT_AT + 3 * SHORT_MIN * 60_000
  const kept = programmes.filter((p) => !SHORT_RUN[p.channel] || p.stop <= SHORT_AT || p.start >= windowEnd)
  const shorts = Object.entries(SHORT_RUN).flatMap(([channel, titles]) => titles.map((title, i) => {
    const at = SHORT_AT + i * SHORT_MIN * 60_000
    const film = FILMS[title]
    const show = SHOWS[title]
    const base = { channel, start: at, stop: at + SHORT_MIN * 60_000, title }
    if (film) return { ...base, desc: film.line, category: 'Movie', icon: `${HOST}/hd/${film.image}.jpg`, date: film.year }
    const n = i + 1
    return {
      ...base, subTitle: `Episode ${n}`, desc: show.lines[n % show.lines.length], category: show.category,
      episode: `${show.season - 1}.${n - 1}.`, icon: `${HOST}/hd/${show.images[n % show.images.length]}.jpg`,
    }
  }))
  return [...kept, ...shorts].sort((a, b) => a.channel.localeCompare(b.channel) || a.start - b.start)
}

const channelXml = (c) => `<channel id="${c.id}"><display-name>${c.name}</display-name><lcn>${c.number}</lcn></channel>`

const programmeXml = (p) => [
  `<programme start="${stamp(p.start)}" stop="${stamp(p.stop)}" channel="${p.channel}">`,
  `<title lang="en">${esc(p.title)}</title>`,
  p.subTitle ? `<sub-title lang="en">${esc(p.subTitle)}</sub-title>` : '',
  `<desc lang="en">${esc(p.desc)}</desc>`,
  `<category lang="en">${esc(p.category)}</category>`,
  p.date ? `<date>${p.date}</date>` : '',
  p.episode ? `<episode-num system="xmltv_ns">${p.episode}</episode-num>` : '',
  `<icon src="${p.icon}"/>`,
  '</programme>',
].join('')

const stamp = (ms) => {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const oh = pad(Math.floor(Math.abs(offset) / 60))
  const om = pad(Math.abs(offset) % 60)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}00 ${sign}${oh}${om}`
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

await main()
