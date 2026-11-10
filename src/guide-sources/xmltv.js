export const parseProgrammeElement = (xml) => {
  const open = String(xml).match(OPEN_TAG)
  if (!open) return null
  const attributes = open[1]
  const close = xml.lastIndexOf('</programme>')
  const body = xml.slice(open[0].length, close < 0 ? xml.length : close)
  const programme = {
    channel: decodeXml(attributeOf(attributes, 'channel') ?? ''),
    start: parseXmltvTime(attributeOf(attributes, 'start')),
    stop: parseXmltvTime(attributeOf(attributes, 'stop')),
    title: '',
    subTitle: null,
    desc: null,
    categories: [],
    rating: null,
    icon: null,
    episodeNums: [],
    extras: [],
    xml,
  }
  for (const [element, name, childAttributes, text = ''] of body.matchAll(CHILD_ELEMENT)) {
    readChild({ programme, element, name, childAttributes, text })
  }
  return programme
}

export const programmeXml = (programme) => [
  `<programme start="${formatXmltvTime(programme.start)}" stop="${formatXmltvTime(programme.stop)}" channel="${escapeXml(programme.channel)}">`,
  `    <title>${escapeXml(programme.title)}</title>`,
  ...(programme.subTitle ? [`    <sub-title>${escapeXml(programme.subTitle)}</sub-title>`] : []),
  ...(programme.desc ? [`    <desc>${escapeXml(programme.desc)}</desc>`] : []),
  ...(programme.categories ?? []).map((category) => `    <category>${escapeXml(category)}</category>`),
  ...(programme.icon ? [`    <icon src="${escapeXml(programme.icon)}"/>`] : []),
  ...(programme.episodeNums ?? []).map(({ system, value }) =>
    `    <episode-num system="${escapeXml(system)}">${escapeXml(value)}</episode-num>`),
  ...(programme.rating ? [`    <rating>\n      <value>${escapeXml(programme.rating)}</value>\n    </rating>`] : []),
  ...(programme.extras ?? []).map((extra) => `    ${extra}`),
  '  </programme>',
].join('\n')

export const channelXml = ({ id, names = [], lcn = null, icon = null }) => [
  `<channel id="${escapeXml(id)}">`,
  ...names.map((name) => `    <display-name>${escapeXml(name)}</display-name>`),
  ...(lcn ? [`    <lcn>${lcn}</lcn>`] : []),
  ...(icon ? [`    <icon src="${escapeXml(icon)}"/>`] : []),
  '  </channel>',
].join('\n')

export const parseChannelElements = (xml) => [...String(xml).matchAll(CHANNEL_ELEMENT)].map(([, id, body]) => ({
  id: decodeXml(id),
  names: [...body.matchAll(DISPLAY_NAME)].map((m) => decodeXml(m[1].trim())),
  lcn: Number(body.match(LCN)?.[1] || 0) || null,
  icon: decodeXml(body.match(ICON_SRC)?.[1] ?? '') || null,
}))

export const parseXmltvTime = (value) => {
  const match = String(value ?? '').match(XMLTV_TIME)
  if (!match) return null
  const [, year, month, day, hour, minute, second = '0', sign, offsetHours = '0', offsetMinutes = '0'] = match
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  const offsetMs = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000
  return sign === '-' ? utc + offsetMs : utc - offsetMs
}

export const formatXmltvTime = (ms) => `${new Date(ms).toISOString().replace(/\D/g, '').slice(0, 14)} +0000`

export const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

export const decodeXml = (value) => String(value)
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (all, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (all, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&amp;/g, '&')

const readChild = ({ programme, element, name, childAttributes, text }) => {
  if (name === 'title' && !programme.title) programme.title = decodeXml(text.trim())
  else if (name === 'sub-title' && !programme.subTitle) programme.subTitle = decodeXml(text.trim()) || null
  else if (name === 'desc' && !programme.desc) programme.desc = decodeXml(text.trim()) || null
  else if (name === 'category') programme.categories.push(decodeXml(text.trim()))
  else if (name === 'icon' && !programme.icon) programme.icon = decodeXml(attributeOf(childAttributes, 'src') ?? '') || null
  else if (name === 'rating' && !programme.rating) programme.rating = decodeXml(text.match(VALUE)?.[1]?.trim() ?? '') || null
  else if (name === 'episode-num') {
    programme.episodeNums.push({ system: decodeXml(attributeOf(childAttributes, 'system') ?? 'onscreen'), value: decodeXml(text.trim()) })
  } else if (!PARSED_ELEMENTS.has(name)) programme.extras.push(element)
}

const attributeOf = (attributes, name) => attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null

const OPEN_TAG = /^<programme\b([^>]*)>/
const CHILD_ELEMENT = /<([a-z][a-z-]*)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g
const CHANNEL_ELEMENT = /<channel\s+id="([^"]+)"\s*>([\s\S]*?)<\/channel>/g
const DISPLAY_NAME = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g
const LCN = /<lcn>\s*(\d+)\s*<\/lcn>/
const ICON_SRC = /<icon\b[^>]*\bsrc="([^"]*)"/
const VALUE = /<value>([^<]*)<\/value>/
const XMLTV_TIME = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2})(\d{2}))?/
const PARSED_ELEMENTS = new Set(['title', 'sub-title', 'desc', 'category', 'icon', 'rating', 'episode-num'])
