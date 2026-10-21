import fs from 'fs/promises'
import path from 'path'
import express from 'express'
import { cacheControlFor, stampAssetUrls, stampIndexHtml } from './build-id.js'

export const webAssets = async ({ webRoot, build, nodeModules }) => {
  const preloads = await staticImportGraph({ webRoot, entry: BOOT_MODULE })
  const cacheControlOf = (req) => cacheControlFor({ requestedBuild: req.query.v, build })
  const router = express.Router()
  for (const [url, file] of Object.entries(VENDOR_FILES)) {
    router.get(url, (req, res) => res.sendFile(path.join(nodeModules, file), {
      headers: { 'Cache-Control': cacheControlOf(req) },
    }))
  }
  router.get(['/', '/index.html'], async (req, res) => {
    const html = await fs.readFile(path.join(webRoot, 'index.html'), 'utf8')
    res.setHeader('Cache-Control', 'no-cache')
    res.type('html').send(stampIndexHtml({ html, build, preloads }))
  })
  router.get(STAMPED_TEXT_PATH, async (req, res, next) => {
    const source = await fs.readFile(path.join(webRoot, req.path), 'utf8').catch(() => null)
    if (source === null) return next()
    res.setHeader('Cache-Control', cacheControlOf(req))
    res.type(path.extname(req.path)).send(stampAssetUrls({ text: source, build }))
  })
  router.use(express.static(webRoot, {
    index: false,
    setHeaders: (res) => res.setHeader('Cache-Control', cacheControlOf(res.req)),
  }))
  return router
}

export const staticImportGraph = async ({ webRoot, entry }) => {
  const seen = new Set()
  const visit = async (url) => {
    if (seen.has(url)) return
    seen.add(url)
    if (url.startsWith('/vendor/')) return
    const source = await fs.readFile(path.join(webRoot, url), 'utf8').catch(() => '')
    for (const specifier of staticImportsOf(source)) await visit(resolveSpecifier({ specifier, from: url }))
  }
  await visit(entry)
  return [...seen]
}

export const staticImportsOf = (source) => [...source.matchAll(STATIC_IMPORT)].map(([, specifier]) => specifier)

const resolveSpecifier = ({ specifier, from }) => specifier.startsWith('/')
  ? specifier
  : path.posix.resolve(path.posix.dirname(from), specifier)

const BOOT_MODULE = '/app.js'

const VENDOR_FILES = {
  '/vendor/vue.esm-browser.prod.js': 'vue/dist/vue.esm-browser.prod.js',
  '/vendor/hls.mjs': 'hls.js/dist/hls.min.mjs',
  '/vendor/hls.worker.js': 'hls.js/dist/hls.worker.js',
}

const STAMPED_TEXT_PATH = /^\/(?:(?:views|components|shared|styles)\/)?[\w.-]+\.(?:js|css)$/

const STATIC_IMPORT = /^\s*(?:import|export)\s*(?:[\w\s{},*$]*?\bfrom\s*)?['"]([^'"]+)['"]/gm
