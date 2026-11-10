import { randomBytes } from 'node:crypto'

import { db } from './db.js'

export const PROGRAMME_STAMP_KIND = 'programme'

export const newPictureStamp = () => randomBytes(STAMP_BYTES).toString('hex')

export const createProgrammeStamps = ({ database = db, newStamp = newPictureStamp, now = Date.now } = {}) => {
  const bump = async (keys = []) => {
    const unique = [...new Set(keys.filter(Boolean))]
    const stamps = new Map(unique.map((key) => [key, newStamp()]))
    const rows = [...stamps].map(([key, stamp]) => ({ show_key: key, stamp, changed_at: now() }))
    for (let at = 0; at < rows.length; at += WRITE_BATCH) {
      await database('programme_picture_stamps').insert(rows.slice(at, at + WRITE_BATCH)).onConflict('show_key').merge()
    }
    return stamps
  }

  const stampsByKey = async () => new Map(
    (await database('programme_picture_stamps').select('show_key', 'stamp')).map((row) => [row.show_key, row.stamp]),
  )

  return { bump, stampsByKey }
}

const STAMP_BYTES = 5
const WRITE_BATCH = 200
