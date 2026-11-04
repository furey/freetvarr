import { deleteSetting, getSetting, setSetting } from './db.js'
import { PLEX_TOKEN_SCOPE_KEY, plexTokenBindsTo } from './plex.js'
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

export const savePlexConnection = async ({ body, store = settingsStore, interfaces }) => {
  if (body.plex_token) {
    await store.set('plex_token', String(body.plex_token))
    await store.remove(PLEX_TOKEN_SCOPE_KEY)
    if (body.plex_url !== undefined) await store.set('plex_url', String(body.plex_url).trim())
    return []
  }
  if (body.plex_url === undefined) return []
  const url = String(body.plex_url).trim()
  const cleared = url ? await rebindPlexToken({ url, store, interfaces }) : []
  await store.set('plex_url', url)
  return cleared
}

export const settingsStore = { get: getSetting, set: setSetting, remove: deleteSetting }

const keepsOrigin = (url, previous) => sameOrigin(url, previous) || stripSlash(url) === stripSlash(previous)

const stripSlash = (url) => String(url ?? '').trim().replace(/\/+$/, '')

const rebindPlexToken = async ({ url, store, interfaces }) => {
  const [token, storedUrl, scope] = await Promise.all([
    store.get('plex_token'),
    store.get('plex_url'),
    store.get(PLEX_TOKEN_SCOPE_KEY),
  ])
  if (!token) return []
  if (!scope && keepsOrigin(url, storedUrl)) return []
  await store.remove(PLEX_TOKEN_SCOPE_KEY)
  if (plexTokenBindsTo({ url, storedUrl, scope, interfaces })) return []
  await store.remove('plex_token')
  return ['plex_token']
}
