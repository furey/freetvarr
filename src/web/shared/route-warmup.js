import { resolveRoute, viewKeyOf } from '/route-table.js'
import { hashesMatch } from '/scroll-memory.js'
import { prefetchGet } from '/shared/api.js'
import { VIEW_FIRST_REQUESTS } from '/view-modules.js'
import { VIEW_PRELOADS } from '/view-preloads.js'

export const registerViewLoader = (loader) => {
  loadViewModule = loader
}

export const warmView = (key) => {
  if (!warmedViews.has(key)) warmedViews.set(key, startWarm(key))
  return warmedViews.get(key)
}

export const warmRouteOnPress = (event) => warmRoute({ href: hrefOf(event), withData: true })

export const warmRouteOnHover = (event) => {
  if (event.pointerType !== 'mouse') return
  const href = hrefOf(event)
  warmRoute({ href, withData: false })
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => warmRoute({ href, withData: true }), HOVER_INTENT_MS)
}

export const cancelRouteHover = () => clearTimeout(hoverTimer)

let loadViewModule = () => Promise.resolve()
let hoverTimer = null
const warmedViews = new Map()
const preloadedModules = new Set()
const HOVER_INTENT_MS = 120

const warmRoute = ({ href, withData }) => {
  if (!href || hashesMatch(href, window.location.hash)) return
  const key = viewKeyOf(resolveRoute(href))
  if (!key) return
  warmView(key)
  if (withData) (VIEW_FIRST_REQUESTS[key] ?? []).forEach(prefetchGet)
}

const startWarm = (key) => {
  preloadModules(VIEW_PRELOADS[key] ?? [])
  return loadViewModule(key).catch(() => warmedViews.delete(key))
}

const preloadModules = (urls) => urls
  .filter((url) => !preloadedModules.has(url))
  .forEach((url) => {
    preloadedModules.add(url)
    const link = document.createElement('link')
    link.rel = 'modulepreload'
    link.href = url
    document.head.append(link)
  })

const hrefOf = (event) => event.currentTarget?.getAttribute('href')
