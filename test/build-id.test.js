import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { cacheControlFor, computeBuildId, readBuildId, stampAssetUrls, stampIndexHtml } from '../src/build-id.js'
import { isStaleBuild, shouldReloadOnPull } from '../src/web/stale-build.js'

const files = [
  { name: 'app.js', content: 'console.log(1)' },
  { name: 'styles.css', content: 'body {}' },
]

const tempWebRoot = async (entries) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-build-id-'))
  await Promise.all(Object.entries(entries).map(([name, content]) =>
    fs.writeFile(path.join(root, name), content)))
  return root
}

test('computeBuildId: the same files and version give the same short id', () => {
  const id = computeBuildId({ version: '1.0.2', files })
  assert.match(id, /^[0-9a-f]{12}$/)
  assert.equal(computeBuildId({ version: '1.0.2', files: [...files].reverse() }), id)
})

test('computeBuildId: a changed file changes the id', () => {
  const changed = [files[0], { name: 'styles.css', content: 'body { color: red }' }]
  assert.notEqual(computeBuildId({ version: '1.0.2', files: changed }), computeBuildId({ version: '1.0.2', files }))
})

test('computeBuildId: a new version changes the id', () => {
  assert.notEqual(computeBuildId({ version: '1.0.3', files }), computeBuildId({ version: '1.0.2', files }))
})

test('computeBuildId: moving bytes between files changes the id', () => {
  const shifted = [{ name: 'app.js', content: 'console.log(1)body' }, { name: 'styles.css', content: ' {}' }]
  assert.notEqual(computeBuildId({ version: '1.0.2', files: shifted }), computeBuildId({ version: '1.0.2', files }))
})

test('readBuildId: hashes the shipped html, js, and css files only', async () => {
  const root = await tempWebRoot({ 'app.js': 'a', 'styles.css': 'b', 'index.html': 'c', 'favicon.svg': 'd' })
  const before = await readBuildId({ webRoot: root, version: '1.0.2' })
  await fs.writeFile(path.join(root, 'favicon.svg'), 'changed')
  assert.equal(await readBuildId({ webRoot: root, version: '1.0.2' }), before)
  await fs.writeFile(path.join(root, 'styles.css'), 'changed')
  assert.notEqual(await readBuildId({ webRoot: root, version: '1.0.2' }), before)
})

test('stampIndexHtml: adds the build meta tag and versions the script and stylesheet urls', () => {
  const html = [
    '<meta charset="utf-8" />',
    '<link rel="modulepreload" href="/app.js" />',
    '<link rel="modulepreload" href="/vendor/vue.esm-browser.prod.js" />',
    '<link rel="preload" href="/fonts/inter-variable.woff2" as="font" />',
    '<link rel="stylesheet" href="/tailwind.css" />',
    '<link rel="stylesheet" href="/styles.css" />',
    '<link rel="icon" href="/favicon.svg" />',
    '<script type="module" src="/app.js"></script>',
  ].join('\n')
  const stamped = stampIndexHtml({ html, build: 'abc123' })
  assert.match(stamped, /<meta name="freetvarr-build" content="abc123" \/>/)
  assert.match(stamped, /href="\/app\.js\?v=abc123"/)
  assert.match(stamped, /src="\/app\.js\?v=abc123"/)
  assert.match(stamped, /href="\/vendor\/vue\.esm-browser\.prod\.js\?v=abc123"/)
  assert.match(stamped, /href="\/tailwind\.css\?v=abc123"/)
  assert.match(stamped, /href="\/styles\.css\?v=abc123"/)
  assert.match(stamped, /href="\/fonts\/inter-variable\.woff2"/)
  assert.match(stamped, /href="\/favicon\.svg"/)
})

test('stampAssetUrls: versions module imports, dynamic imports, and worker paths', () => {
  const source = [
    "import { ref } from '/vendor/vue.esm-browser.prod.js'",
    "import { isStaleBuild } from '/stale-build.js'",
    "const { default: Hls } = await import('/vendor/hls.mjs')",
    "const config = { workerPath: '/vendor/hls.worker.js' }",
    "fetch('/api/settings')",
    "link.href = '/favicon.svg'",
  ].join('\n')
  assert.equal(stampAssetUrls({ text: source, build: 'abc123' }), [
    "import { ref } from '/vendor/vue.esm-browser.prod.js?v=abc123'",
    "import { isStaleBuild } from '/stale-build.js?v=abc123'",
    "const { default: Hls } = await import('/vendor/hls.mjs?v=abc123')",
    "const config = { workerPath: '/vendor/hls.worker.js?v=abc123' }",
    "fetch('/api/settings')",
    "link.href = '/favicon.svg'",
  ].join('\n'))
})

test('cacheControlFor: only the current build is immutable', () => {
  assert.equal(cacheControlFor({ requestedBuild: 'abc123', build: 'abc123' }), 'public, max-age=31536000, immutable')
  assert.equal(cacheControlFor({ requestedBuild: 'old456', build: 'abc123' }), 'no-cache')
  assert.equal(cacheControlFor({ requestedBuild: undefined, build: 'abc123' }), 'no-cache')
})

test('isStaleBuild: a different server build is stale', () => {
  assert.equal(isStaleBuild({ loaded: 'aaa', latest: 'bbb' }), true)
})

test('isStaleBuild: the same build, or no build seen yet, is not stale', () => {
  assert.equal(isStaleBuild({ loaded: 'aaa', latest: 'aaa' }), false)
  assert.equal(isStaleBuild({ loaded: 'aaa', latest: null }), false)
  assert.equal(isStaleBuild({ loaded: null, latest: 'bbb' }), false)
})

test('shouldReloadOnPull: a newer build reloads, the same build refreshes in place', () => {
  assert.equal(shouldReloadOnPull({ loaded: 'aaa', latest: 'bbb' }), true)
  assert.equal(shouldReloadOnPull({ loaded: 'aaa', latest: 'aaa' }), false)
})
