import net from 'node:net'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { StringDecoder } from 'node:string_decoder'

import { openFeedStream, parseFeedChannels, parseXmltvTime } from './tvheadend-guide.js'
import {
  createClassificationRecorder,
  createClassificationStore,
  programmeClassificationEntry,
} from './classification-labels.js'

export const GUIDE_FEED_PATH = '/guide/xmltv.xml'

export const GUIDE_SOURCE_KEY = 'guide_source_url'

export const serveShiftedFeed = async ({
  sourceUrl,
  res,
  planShifts,
  openFeed = openFeedStream,
  classifications = defaultClassifications(),
}) => {
  const source = await openFeed(sourceUrl)
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  const recorder = createClassificationRecorder({ store: classifications })
  await pipeline(source, createShiftedFeedStream({ planShifts, onClassifications: recorder.add }), res)
  recorder.finish()
}

export const createShiftedFeedStream = ({ planShifts, onClassifications = () => {} }) => {
  const decoder = new StringDecoder('utf8')
  let pending = ''
  let shifts = null
  const startProgrammes = async (stream, head) => {
    shifts = await planShifts(parseFeedChannels(head))
    stream.push(head + shiftedChannelsXml({ head, shifts }))
  }
  return new Transform({
    async transform(chunk, encoding, callback) {
      try {
        pending += decoder.write(chunk)
        if (!shifts) {
          const start = pending.indexOf(PROGRAMME_TAG)
          if (start < 0) return callback()
          await startProgrammes(this, pending.slice(0, start))
          pending = pending.slice(start)
        }
        const cut = pending.lastIndexOf(PROGRAMME_TAG)
        if (cut > 0) {
          const xml = pending.slice(0, cut)
          pending = pending.slice(cut)
          this.push(shiftProgrammes({ xml, shifts }))
          onClassifications(programmeClassifications({ xml, shifts }))
        }
        callback()
      } catch (err) {
        callback(err)
      }
    },
    flush(callback) {
      pending += decoder.end()
      this.push(shifts ? shiftProgrammes({ xml: pending, shifts }) : pending)
      if (shifts) onClassifications(programmeClassifications({ xml: pending, shifts }))
      callback()
    },
  })
}

export const shiftProgrammes = ({ xml, shifts }) => {
  if (!shifts.length) return xml
  return xml.replace(PROGRAMME_ELEMENT, (programme) => {
    const channel = decodeAttribute(programme.match(CHANNEL_ATTRIBUTE)?.[1] ?? '')
    const copies = shifts.filter((s) => s.baseId === channel).map((shift) => shiftedProgramme({ programme, shift }))
    return [programme, ...copies].join('\n  ')
  })
}

export const programmeClassifications = ({ xml, shifts = [] }) => {
  if (!xml.includes(RATING_TAG) && !xml.includes(CATEGORY_TAG)) return []
  return [...xml.matchAll(PROGRAMME_ELEMENT)].flatMap(([programme]) => {
    const entry = programmeClassificationEntry({ programmeXml: programme, parseTime: parseXmltvTime })
    if (!entry) return []
    const channel = decodeAttribute(programme.match(CHANNEL_ATTRIBUTE)?.[1] ?? '')
    const copies = shifts
      .filter((shift) => shift.baseId === channel)
      .map((shift) => ({ ...entry, startMs: entry.startMs + shift.hours * HOUR_MS }))
    return [entry, ...copies]
  })
}

export const shiftedChannelsXml = ({ head, shifts }) => {
  const icons = channelIcons(head)
  return shifts.map((shift) => [
    `<channel id="${escapeXml(shift.id)}">`,
    ...shift.names.map((name) => `    <display-name>${escapeXml(name)}</display-name>`),
    ...(shift.lcn ? [`    <lcn>${shift.lcn}</lcn>`] : []),
    ...(icons.has(shift.baseId) ? [`    ${icons.get(shift.baseId)}`] : []),
    '  </channel>\n  ',
  ].join('\n')).join('')
}

export const shiftXmltvTime = ({ value, ms }) => {
  const at = parseXmltvTime(value)
  if (at === null) return value
  const offset = String(value).match(OFFSET)
  const offsetMs = offset ? offsetMinutes(offset) * 60_000 : 0
  const local = new Date(at + ms + offsetMs).toISOString().replace(/\D/g, '').slice(0, 14)
  return offset ? `${local} ${offset[1]}${offset[2]}${offset[3]}` : local
}

export const localAddressToward = (url, { timeoutMs = CONNECT_TIMEOUT_MS } = {}) => new Promise((resolve, reject) => {
  const { hostname, port, protocol } = new URL(url)
  const socket = net.connect({
    host: hostname.replace(/^\[|\]$/g, ''),
    port: Number(port) || (protocol === 'https:' ? 443 : 80),
  })
  socket.setTimeout(timeoutMs)
  socket.once('connect', () => {
    const address = socket.localAddress
    socket.end()
    resolve(address)
  })
  socket.once('timeout', () => {
    socket.destroy()
    reject(new Error('timed out'))
  })
  socket.once('error', reject)
})

export const guideFeedUrl = ({ address, port }) => {
  const host = String(address).replace(/^::ffff:/, '')
  return `http://${host.includes(':') ? `[${host}]` : host}:${port}${GUIDE_FEED_PATH}`
}

export const isGuideFeedUrl = (url) => {
  try {
    return new URL(url).pathname === GUIDE_FEED_PATH
  } catch {
    return false
  }
}

export const createRequestWatch = ({ now = Date.now } = {}) => {
  let lastAt = 0
  const waiters = new Set()
  return {
    note: () => {
      lastAt = now()
      for (const wake of waiters) wake()
      waiters.clear()
    },
    waitSince: ({ since, limitMs }) => {
      if (lastAt >= since) return Promise.resolve(true)
      return new Promise((resolve) => {
        const wake = () => {
          clearTimeout(timer)
          resolve(true)
        }
        const timer = setTimeout(() => {
          waiters.delete(wake)
          resolve(false)
        }, limitMs)
        timer.unref?.()
        waiters.add(wake)
      })
    },
  }
}

let sharedClassifications = null
const defaultClassifications = () => {
  sharedClassifications ??= createClassificationStore()
  return sharedClassifications
}

const shiftedProgramme = ({ programme, shift }) => {
  const openTag = programme.match(OPEN_TAG)[0]
  const shiftedTag = openTag
    .replace(TIME_ATTRIBUTE, (all, name, value) => `${name}="${shiftXmltvTime({ value, ms: shift.hours * HOUR_MS })}"`)
    .replace(CHANNEL_ATTRIBUTE, `channel="${escapeXml(shift.id)}"`)
  return shiftedTag + programme.slice(openTag.length)
}

const channelIcons = (head) => new Map([...head.matchAll(CHANNEL_ELEMENT)]
  .map(([, id, body]) => [decodeAttribute(id), body.match(ICON_ELEMENT)?.[0]])
  .filter(([, icon]) => icon))

const offsetMinutes = ([, sign, hours, minutes]) => (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes))

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const decodeAttribute = (value) => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')

const PROGRAMME_TAG = '<programme'
const RATING_TAG = '<rating'
const CATEGORY_TAG = '<category'
const PROGRAMME_ELEMENT = /<programme\b[^>]*?(?:\/>|>[\s\S]*?<\/programme>)/g
const OPEN_TAG = /^<programme\b[^>]*>/
const CHANNEL_ATTRIBUTE = /\bchannel="([^"]*)"/
const TIME_ATTRIBUTE = /\b(start|stop)="([^"]*)"/g
const CHANNEL_ELEMENT = /<channel\s+id="([^"]+)"\s*>([\s\S]*?)<\/channel>/g
const ICON_ELEMENT = /<icon\b[^>]*\/>/
const OFFSET = /\s([+-])(\d{2})(\d{2})\s*$/
const HOUR_MS = 60 * 60_000
const CONNECT_TIMEOUT_MS = 5000
