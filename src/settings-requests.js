import { db, setSetting } from './db.js'
import { isKnownTimeZone } from './time-zone.js'

export const RETENTION_DAYS_ERROR = 'Enter a whole number of days, 1 or more, to keep the original after a cut.'

export const settingsSaveRefusalOf = (body = {}) => {
  const timeZone = body.time_zone === undefined ? undefined : String(body.time_zone).trim()
  if (timeZone !== undefined && !isKnownTimeZone(timeZone)) return `Unknown time zone "${timeZone}"`
  if (body.ad_original_retention_days !== undefined && !retentionDaysOf(body.ad_original_retention_days)) return RETENTION_DAYS_ERROR
  return null
}

export const retentionDaysOf = (value) => {
  if (value === null || String(value).trim() === '') return null
  const days = Number(value)
  return Number.isInteger(days) && days > 0 ? days : null
}

export const saveMoviesRoot = async (value) => {
  if (value === undefined) return
  const root = String(value).trim()
  if (!root) return db('settings').where({ key: 'movies_root' }).delete()
  return setSetting('movies_root', root)
}

export const tvhTestRequestOf = (body = {}) => ({
  url: body.tvh_url !== undefined ? String(body.tvh_url).trim() : undefined,
  username: body.tvh_username !== undefined ? String(body.tvh_username).trim() : undefined,
  password: body.tvh_password ? String(body.tvh_password) : undefined,
  persist: body.persist !== false,
})
