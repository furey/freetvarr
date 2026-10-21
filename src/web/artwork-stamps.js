import { showKeyOf } from './show-key.js'

export const ARTWORK_STAMPS_KEY = 'freetvarr.artworkStamps'
export const SHOW_IMAGE_PATH = '/api/epg/show-image'

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

  const setStamp = ({ key, kind, stamp }) => {
    const next = { ...stamps.get(key), [kind]: stamp || null }
    if (next.background || next.poster) stamps.set(key, next)
    else stamps.delete(key)
    changed()
  }

  const stampOf = ({ title, kind = 'background' }) => stamps.get(showKeyOf(title))?.[kind] || null

  const stampUrl = (url) => {
    if (!isShowImageUrl(url)) return url
    const params = new URLSearchParams(String(url).split('?')[1] || '')
    const kind = params.get('shape') === 'poster' ? 'poster' : 'background'
    return withChoiceStamp({ url, stamp: stampOf({ title: params.get('title') || '', kind }) })
  }

  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { replaceAll, setStamp, stampOf, stampUrl, subscribe }
}

export const isShowImageUrl = (url) => typeof url === 'string' && url.startsWith(`${SHOW_IMAGE_PATH}?`)

export const withChoiceStamp = ({ url, stamp }) => {
  const [path, query = ''] = String(url).split('?')
  const kept = query.split('&').filter((part) => part && !part.startsWith('c='))
  if (stamp) kept.push(`c=${encodeURIComponent(stamp)}`)
  return kept.length ? `${path}?${kept.join('&')}` : path
}

export const showImageUrlOf = ({ title, width = null, shape = null, kind = null }) => [
  `${SHOW_IMAGE_PATH}?title=${encodeURIComponent(title)}`,
  shape ? `&shape=${shape}` : '',
  kind ? `&kind=${kind}` : '',
  width ? `&w=${width}` : '',
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
