import { db, getSetting } from './db.js'
import { readHeadroomMb } from './for-you-engine.js'
import { FOCUS_SETTING, createImageFocus, faceFocusEnabledFrom, runFocusWorker } from './image-focus.js'

export const isFaceFocusEnabled = async () => faceFocusEnabledFrom(await getSetting(FOCUS_SETTING))

export const imageFocus = createImageFocus({
  loadRows: async () => (await db('image_focus').select()).map(rowFromRecord),
  saveRow: (row) => db('image_focus').insert(recordFromRow(row)).onConflict('url_key').merge(),
  isEnabled: isFaceFocusEnabled,
  readHeadroomMb,
  detect: (jobs) => runFocusWorker({ jobs }),
})

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
})

const parseBox = (text) => {
  try {
    const box = JSON.parse(text)
    return Array.isArray(box) && box.length === 4 ? box : null
  } catch {
    return null
  }
}
