import { showKeyOf } from './show-key.js'

export const ARTWORK_STAMPS_KEY = 'freetvarr.artworkStamps'
export const SHOW_IMAGE_PATH = '/api/epg/show-image'
export const SERIES_MATCH_VERSION = 'series-v2'

export const createArtworkStamps = ({ storage = null } = {}) => {
  const stamps = new Map(Object.entries(readSaved(storage)))
  const listeners = new Set()

  const changed = () => {
    save({ storage, stamps })
    listeners.forEach((listener) => listener())
  }

  const replaceAll = (entries = {}) => {
    stamps.clear()
    for (const [key, value] of Object.entries(entries)) stamps.set(key, value)
    changed()
  }

  const putStamp = ({ key, kind, stamp }) => {
    const next = { ...stamps.get(key), [kind]: stamp || null }
    if (next.background || next.poster) stamps.set(key, next)
    else stamps.delete(key)
  }

  const setStamp = (entry) => {
    putStamp(entry)
    changed()
  }

  const setStamps = (entries = []) => {
    const fresh = entries.filter(({ key, kind, stamp }) => key && STAMP_KINDS.includes(kind) && stamps.get(key)?.[kind] !== stamp)
    if (!fresh.length) return
    fresh.forEach(putStamp)
    changed()
  }

  const stampOf = ({ title, kind = 'background' }) => stamps.get(showKeyOf(title))?.[kind] || null

  const stampUrl = (url) => {
    const picture = pictureOfShowImageUrl(url)
    if (!picture) return url
    return withChoiceStamp({ url, stamp: stamps.get(picture.key)?.[picture.kind] || SERIES_MATCH_VERSION })
  }

  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { replaceAll, setStamp, setStamps, stampOf, stampUrl, subscribe }
}

export const pictureOfShowImageUrl = (url) => {
  if (!isShowImageUrl(url)) return null
  const params = new URLSearchParams(String(url).split('?')[1] || '')
  return { key: showKeyOf(params.get('title') || ''), kind: params.get('shape') === 'poster' ? 'poster' : 'background' }
}

export const unstampedUrl = (url) => (isShowImageUrl(url) ? withChoiceStamp({ url, stamp: null }) : url)

export const artKindHintOf = (kind) => ART_KIND_HINTS[kind] ?? null

export const isShowImageUrl = (url) => typeof url === 'string' && url.startsWith(`${SHOW_IMAGE_PATH}?`)

export const withChoiceStamp = ({ url, stamp }) => {
  const [path, query = ''] = String(url).split('?')
  const kept = query.split('&').filter((part) => part && !part.startsWith('c='))
  if (stamp) kept.push(`c=${encodeURIComponent(stamp)}`)
  return kept.length ? `${path}?${kept.join('&')}` : path
}

export const showImageUrlOf = ({ title, width = null, shape = null, kind = null, stamp = null }) => [
  `${SHOW_IMAGE_PATH}?title=${encodeURIComponent(title)}`,
  shape ? `&shape=${shape}` : '',
  kind ? `&kind=${kind}` : '',
  width ? `&w=${width}` : '',
  stamp ? `&c=${encodeURIComponent(stamp)}` : '',
].join('')

const browserStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const readSaved = (storage) => {
  try {
    const saved = JSON.parse(storage?.getItem(ARTWORK_STAMPS_KEY) || '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  } catch {
    return {}
  }
}

const save = ({ storage, stamps }) => {
  try {
    storage?.setItem(ARTWORK_STAMPS_KEY, JSON.stringify(Object.fromEntries(stamps)))
  } catch {}
}

export const artworkStamps = createArtworkStamps({ storage: browserStorage() })

const STAMP_KINDS = ['background', 'poster']
const ART_KIND_HINTS = { movie: 'movie', series: 'series', oneoff: 'one-off', 'one-off': 'one-off' }
