import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const WEB_ROOT = path.join(import.meta.dirname, '..', 'src', 'web')

const sourceFilesIn = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? sourceFilesIn(full) : [full]
  }))
  return nested.flat().filter((file) => /\.(js|css)$/.test(file) && !file.includes('vendor'))
}

const read = (relative) => fs.readFile(path.join(WEB_ROOT, relative), 'utf8')

test('every details summary uses the shared disclosure style', async () => {
  const files = (await sourceFilesIn(WEB_ROOT)).filter((file) => file.endsWith('.js'))
  const summaries = []
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8')
    if (source.includes('<details')) summaries.push(...[...source.matchAll(/<summary[^>]*>/g)].map(([tag]) => tag))
  }
  assert.ok(summaries.length >= 3)
  for (const tag of summaries) assert.match(tag, /ui-disclosure-summary/)
})

test('no stylesheet draws a triangle or a summary arrow of its own', async () => {
  const files = (await sourceFilesIn(WEB_ROOT)).filter((file) => file.endsWith('.css'))
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8')
    assert.doesNotMatch(source, /content:\s*"\\25B[6C]"/i, file)
    assert.doesNotMatch(source, /summary::after/, file)
  }
})

test('the shared chevron points right when closed and turns down when open', async () => {
  const css = await read('styles/base.css')
  assert.match(css, /path d='m9 18 6-6-6-6'/)
  assert.match(css, /details\[open\] > \.ui-disclosure-summary::before[\s\S]*?rotate: 90deg/)
  assert.match(css, /\.ui-disclosure-chevron\.is-open[\s\S]*?rotate: 90deg/)
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.ui-disclosure-chevron[\s\S]*?transition: none/)
})

test('in-place expanders show the shared chevron', async () => {
  const doctor = await read('views/doctor-view.js')
  const welcome = await read('views/welcome-view.js')
  assert.match(doctor, /health-working-toggle[\s\S]*?<disclosure-chevron \/>/)
  assert.equal(welcome.match(/setup-quiet-link ui-disclosure-trigger/g).length, 2)
})

test('list rows that open a drawer show no chevron', async () => {
  for (const view of ['setup-settings-view', 'scheduled-view', 'syncs-view']) {
    const source = await read(`views/${view}.js`)
    assert.doesNotMatch(source, /<disclosure-chevron|<chevron-glyph/, view)
  }
})

test('the Settings nav keeps room above the save bar', async () => {
  const css = await read('styles/settings.css')
  assert.match(css, /--settings-save-bar-h: 72px/)
  assert.match(css, /calc\(40px \+ var\(--settings-save-bar-h\)\) calc\(var\(--gutter\) - 12px\)/)
})
