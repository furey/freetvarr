import { IMAGE_RESPONSE_CSP, rasterTypeOf } from './raster-type.js'
import { ART_FINAL, ART_STATE_HEADER } from './web/art-fallback.js'

export const imageRouteOf = ({ path, widthOf, loadImage, paramsOf = ({ params }) => params, widthError = 'w is not a supported width', isWarm = null }) => ({
  path,
  pattern: patternOf(path),
  widthOf,
  loadImage,
  paramsOf,
  widthError,
  isWarm,
})

export const loadRouteImage = async ({ route, params = {}, query = {} }) => {
  const width = route.widthOf(query.w)
  if (width === null) return { image: null, pending: false, badWidth: true }
  return imageResultOf(await route.loadImage({ ...route.paramsOf({ params, query }), width }))
}

export const serveImageRoute = ({ route, imageMaxAgeS }) => async (req, res) => {
  try {
    const { image, pending, final, badWidth, provisional } = await loadRouteImage({ route, params: req.params, query: req.query })
    if (badWidth) return res.status(400).json({ error: route.widthError })
    if (!image) return sendMissing(res, artStateOf({ pending, final }))
    const contentType = rasterTypeOf(image.body)
    if (!contentType) return sendMissing(res)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Security-Policy', IMAGE_RESPONSE_CSP)
    res.setHeader('Cache-Control', provisional ? PROVISIONAL_CACHE : `public, max-age=${imageMaxAgeS}`)
    res.send(image.body)
  } catch {
    sendMissing(res)
  }
}

export const createImageResolver = (routes) => async (url) => {
  const { pathname, query } = requestOf(url)
  for (const route of routes) {
    const params = paramsFrom({ pattern: route.pattern, pathname })
    if (params) return loadRouteImage({ route, params, query })
  }
  return { image: null, pending: false, unknownRoute: true }
}

export const createImageWarmCheck = (routes) => async (url) => {
  const { pathname, query } = requestOf(url)
  for (const route of routes) {
    const params = paramsFrom({ pattern: route.pattern, pathname })
    if (!params) continue
    const width = route.widthOf(query.w)
    if (width === null || !route.isWarm) return false
    return Boolean(await route.isWarm({ ...route.paramsOf({ params, query }), width }))
  }
  return false
}

export const imageResultOf = (result) => {
  if (result?.body) return { image: result, pending: false }
  const image = result?.image ?? null
  if (image && result.provisional) return { image, pending: false, provisional: true }
  return result?.final && !image ? { image, pending: false, final: true } : { image, pending: Boolean(result?.pending) }
}

const requestOf = (url) => {
  const parsed = new URL(String(url), LOCAL_BASE)
  const query = {}
  for (const [name, value] of parsed.searchParams) query[name] ??= value
  return { pathname: parsed.pathname, query }
}

const patternOf = (path) => {
  const names = []
  const source = path
    .split('/')
    .map((part) => {
      if (!part.startsWith(':')) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      names.push(part.slice(1))
      return '([^/]+)'
    })
    .join('/')
  return { regex: new RegExp(`^${source}$`), names }
}

const paramsFrom = ({ pattern, pathname }) => {
  const match = pattern.regex.exec(pathname)
  if (!match) return null
  try {
    return Object.fromEntries(pattern.names.map((name, at) => [name, decodeURIComponent(match[at + 1])]))
  } catch {
    return null
  }
}

const artStateOf = ({ pending, final }) => {
  if (final) return ART_FINAL
  return pending ? ART_PENDING : null
}

const sendMissing = (res, state = null) => {
  res.setHeader('Cache-Control', 'no-store')
  if (state) res.setHeader(ART_STATE_HEADER, state)
  res.status(404).end()
}

const LOCAL_BASE = 'http://localhost'
const PROVISIONAL_CACHE = 'no-cache'
const ART_PENDING = 'pending'
