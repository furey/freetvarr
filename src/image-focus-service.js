import { db, getSetting } from './db.js'
import { readHeadroomMb } from './for-you-engine.js'
import { FOCUS_SETTING, MAX_FOCUS_ROWS, createImageFocus, faceFocusEnabledFrom, runFocusWorker } from './image-focus.js'
import { focusKeyOf } from './web/image-focus.js'
import { measureJob } from './event-loop-lag.js'

export const isFaceFocusEnabled = async () => faceFocusEnabledFrom(await getSetting(FOCUS_SETTING))

export const imageFocus = createImageFocus({
  loadRows: async () => {
    await pruneFocusRows()
    return (await db('image_focus').select()).map(rowFromRecord)
  },
  saveRow: (row) => db('image_focus').insert(recordFromRow(row)).onConflict('url_key').merge(),
  forgetRows: (keys) => forgetFocusRows(keys),
  isEnabled: isFaceFocusEnabled,
  readHeadroomMb,
  detect: (jobs) => measureJob('focus-worker', () => runFocusWorker({ jobs }), { kind: 'focus', total: jobs.length, unit: 'pictures' }),
  render: (url) => renderLocally(url),
})

export const pruneFocusRows = async ({ keep = MAX_FOCUS_ROWS, database = db } = {}) => database('image_focus')
  .whereNotIn('url_key', database('image_focus').select('url_key').orderBy('updated_at', 'desc').limit(keep))
  .del()

export const forgetFocusRows = async (keys, database = db) => {
  for (let start = 0; start < keys.length; start += DELETE_CHUNK) {
    await database('image_focus').whereIn('url_key', keys.slice(start, start + DELETE_CHUNK)).del()
  }
}

export const localRenderUrlOf = (url, origin = LOCAL_ORIGIN) => {
  const parsed = parsedUrlOf(url, origin)
  if (!parsed || parsed.origin !== new URL(origin).origin || !focusKeyOf(parsed.href, origin)) return null
  return parsed.href
}

const renderLocally = async (url) => {
  const target = localRenderUrlOf(url)
  if (!target) return null
  const res = await fetch(target, { signal: AbortSignal.timeout(RENDER_TIMEOUT_MS), redirect: 'error' })
  if (!res.ok || !PICTURE_TYPE.test(res.headers.get('content-type') || '')) return null
  return Buffer.from(await res.arrayBuffer())
}

const rowFromRecord = (record) => ({
  urlKey: record.url_key,
  sourceHash: record.source_hash,
  width: record.width,
  x: record.x,
  y: record.y,
  box: parseBox(record.keep_box),
  method: record.method,
  version: record.version,
  updatedAt: Number(record.updated_at),
  hashes: parseHashes(record.width_hashes),
})

const recordFromRow = (row) => ({
  url_key: row.urlKey,
  source_hash: row.sourceHash,
  width: row.width,
  x: row.x,
  y: row.y,
  keep_box: row.box ? JSON.stringify(row.box) : null,
  method: row.method,
  version: row.version,
  updated_at: row.updatedAt,
  width_hashes: row.hashes ? JSON.stringify(row.hashes) : null,
})

const parsedUrlOf = (url, base) => {
  try {
    return String(url).startsWith('/') && !String(url).startsWith('//') ? new URL(url, base) : null
  } catch {
    return null
  }
}

const parseHashes = (text) => {
  try {
    const hashes = JSON.parse(text)
    return hashes && typeof hashes === 'object' && !Array.isArray(hashes) ? hashes : null
  } catch {
    return null
  }
}

const parseBox = (text) => {
  try {
    const box = JSON.parse(text)
    return Array.isArray(box) && box.length === 4 ? box : null
  } catch {
    return null
  }
}

const LOCAL_ORIGIN = `http://127.0.0.1:${Number(process.env.PORT || 3733)}`
const RENDER_TIMEOUT_MS = 30 * 1000
const DELETE_CHUNK = 500
const PICTURE_TYPE = /^image\/(webp|jpeg|png)/
