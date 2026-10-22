export const imageRouteOf = ({ path, widthOf, loadImage, paramsOf = ({ params }) => params, widthError = 'w is not a supported width' }) => ({
  path,
  pattern: patternOf(path),
  widthOf,
  loadImage,
  paramsOf,
  widthError,
})

export const loadRouteImage = async ({ route, params = {}, query = {} }) => {
  const width = route.widthOf(query.w)
  if (width === null) return { image: null, pending: false, badWidth: true }
  return imageResultOf(await route.loadImage({ ...route.paramsOf({ params, query }), width }))
}

export const serveImageRoute = ({ route, missingMaxAgeS, imageMaxAgeS }) => async (req, res) => {
  try {
    const { image, pending, badWidth } = await loadRouteImage({ route, params: req.params, query: req.query })
    if (badWidth) return res.status(400).json({ error: route.widthError })
    if (!image) return pending ? sendPending(res) : sendMissing({ res, maxAgeS: missingMaxAgeS })
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Cache-Control', `public, max-age=${imageMaxAgeS}`)
    res.send(image.body)
  } catch {
    sendMissing({ res, maxAgeS: missingMaxAgeS })
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

export const imageResultOf = (result) => (result?.body
  ? { image: result, pending: false }
  : { image: result?.image ?? null, pending: Boolean(result?.pending) })

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

const sendMissing = ({ res, maxAgeS }) => {
  res.setHeader('Cache-Control', `public, max-age=${maxAgeS}`)
  res.status(404).end()
}

const sendPending = (res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.status(404).end()
}

const LOCAL_BASE = 'http://localhost'
