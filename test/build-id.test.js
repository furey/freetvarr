import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { computeBuildId, readBuildId, stampIndexHtml } from '../src/build-id.js'
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

test('stampIndexHtml: adds the build meta tag and versions the app.js and styles.css urls', () => {
  const html = [
    '<meta charset="utf-8" />',
    '<link rel="modulepreload" href="/app.js" />',
    '<link rel="modulepreload" href="/vendor/vue.esm-browser.prod.js" />',
    '<link rel="stylesheet" href="/styles.css" />',
    '<script type="module" src="/app.js"></script>',
  ].join('\n')
  const stamped = stampIndexHtml({ html, build: 'abc123' })
  assert.match(stamped, /<meta name="freetvarr-build" content="abc123" \/>/)
  assert.match(stamped, /href="\/app\.js\?v=abc123"/)
  assert.match(stamped, /src="\/app\.js\?v=abc123"/)
  assert.match(stamped, /href="\/styles\.css\?v=abc123"/)
  assert.match(stamped, /href="\/vendor\/vue\.esm-browser\.prod\.js"/)
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
