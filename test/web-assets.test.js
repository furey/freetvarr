import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

import { stampAssetUrls } from '../src/build-id.js'
import { staticImportGraph, staticImportsOf, webAssets } from '../src/web-assets.js'

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const WEB_ROOT = path.join(REPO_ROOT, 'src', 'web')
const BUILD = 'abc123'

let appServer
let baseUrl

before(async () => {
  const app = express()
  app.use(await webAssets({ webRoot: WEB_ROOT, build: BUILD, nodeModules: path.join(REPO_ROOT, 'node_modules') }))
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(() => appServer?.close())

const tempWebRoot = async (entries) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-web-assets-'))
  for (const [name, content] of Object.entries(entries)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await fs.writeFile(path.join(root, name), content)
  }
  return root
}

const shippedScripts = async () => (await fs.readdir(WEB_ROOT, { recursive: true }))
  .filter((name) => name.endsWith('.js') && !name.startsWith('vendor'))

test('staticImportsOf: reads static imports and re-exports, not dynamic imports', () => {
  const source = [
    "import { ref } from '/vendor/vue.esm-browser.prod.js'",
    'import {',
    '  TvIcon,',
    '  PlayIcon,',
    "} from '/components/icons.js'",
    "import './side-effect.js'",
    "export { showKey } from './show-key.js'",
    "export * from '../shared/format.js'",
    "const later = () => import('/views/live-view.js')",
    "export const label = 'from /nowhere.js'",
  ].join('\n')
  assert.deepEqual(staticImportsOf(source), [
    '/vendor/vue.esm-browser.prod.js',
    '/components/icons.js',
    './side-effect.js',
    './show-key.js',
    '../shared/format.js',
  ])
})

test('staticImportGraph: follows absolute and relative imports once each', async () => {
  const root = await tempWebRoot({
    'app.js': "import { a } from '/a.js'\nimport { b } from './views/b.js'\nconst c = () => import('/c.js')",
    'a.js': "import { ref } from '/vendor/vue.esm-browser.prod.js'\nimport { b } from '/views/b.js'",
    'views/b.js': "import { d } from '../d.js'",
    'c.js': '',
    'd.js': '',
  })
  assert.deepEqual(
    await staticImportGraph({ webRoot: root, entry: '/app.js' }),
    ['/app.js', '/a.js', '/vendor/vue.esm-browser.prod.js', '/views/b.js', '/d.js'],
  )
})

test('boot graph: holds Home and leaves the other views to load on demand', async () => {
  const graph = await staticImportGraph({ webRoot: WEB_ROOT, entry: '/app.js' })
  assert.ok(graph.includes('/views/home-view.js'))
  for (const view of ['live-view', 'epg-view', 'recordings-library-view', 'settings-shell', 'welcome-view']) {
    assert.ok(!graph.includes(`/views/${view}.js`), view)
  }
})

test('every module import in the web client gets a build stamp, so no module loads twice', async () => {
  for (const name of await shippedScripts()) {
    const stamped = stampAssetUrls({ text: await fs.readFile(path.join(WEB_ROOT, name), 'utf8'), build: BUILD })
    for (const specifier of staticImportsOf(stamped)) assert.match(specifier, /\?v=abc123$/, `${name}: ${specifier}`)
  }
})

test('index.html: modulepreloads the whole boot graph with stamped urls', async () => {
  const html = await (await fetch(`${baseUrl}/`)).text()
  const preloaded = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map(([, href]) => href)
  const graph = await staticImportGraph({ webRoot: WEB_ROOT, entry: '/app.js' })
  assert.deepEqual(preloaded, graph.map((url) => `${url}?v=${BUILD}`))
})

test('stylesheets: font urls carry the build stamp and the stylesheet is immutable', async () => {
  const res = await fetch(`${baseUrl}/styles.css?v=${BUILD}`)
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.match(res.headers.get('content-type'), /text\/css/)
  const css = await res.text()
  assert.match(css, /url\('\/fonts\/[\w.-]+\.woff2\?v=abc123'\)/)
  assert.doesNotMatch(css, /\.woff2'\)/)
})

test('fonts: the stamped url is immutable and the bare url revalidates', async () => {
  const stamped = await fetch(`${baseUrl}/fonts/figtree-latin-variable.woff2?v=${BUILD}`)
  assert.equal(stamped.status, 200)
  assert.equal(stamped.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  const bare = await fetch(`${baseUrl}/fonts/figtree-latin-variable.woff2`)
  assert.equal(bare.headers.get('cache-control'), 'no-cache')
})
