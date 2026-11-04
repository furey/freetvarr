import { deleteSetting, getSetting, setSetting } from './db.js'
import { sameOrigin } from './url-binding.js'

export const saveTvheadendConnection = async ({ body, store = settingsStore }) => {
  const cleared = []
  if (body.tvh_url !== undefined) {
    const url = String(body.tvh_url).trim()
    const previous = await store.get('tvh_url')
    const dropsPassword = !body.tvh_password && !keepsOrigin(url, previous) && Boolean(await store.get('tvh_password'))
    if (dropsPassword) {
      await store.remove('tvh_password')
      cleared.push('tvh_password')
    }
    await store.set('tvh_url', url)
  }
  if (body.tvh_username !== undefined) await store.set('tvh_username', String(body.tvh_username).trim())
  if (body.tvh_password) await store.set('tvh_password', String(body.tvh_password))
  return cleared
}

export const settingsStore = { get: getSetting, set: setSetting, remove: deleteSetting }

const keepsOrigin = (url, previous) => sameOrigin(url, previous) || stripSlash(url) === stripSlash(previous)

const stripSlash = (url) => String(url ?? '').trim().replace(/\/+$/, '')
