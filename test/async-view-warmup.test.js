import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { defineAsyncComponent } = await import('../node_modules/vue/dist/vue.esm-browser.prod.js')
const app = readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8')

test('Vue async components still expose __asyncLoader, which view warm-up calls so a warmed view renders in its first frame', async () => {
  const view = { name: 'WarmedView' }
  const lazy = defineAsyncComponent({ loader: async () => view })
  assert.equal(typeof lazy.__asyncLoader, 'function', 'Vue renamed __asyncLoader; update registerViewLoader in src/web/app.js')
  assert.equal(await lazy.__asyncLoader(), view)
  assert.equal(lazy.__asyncResolved, view)
})

test('view warm-up resolves the async wrapper itself, with the plain loader as a fallback', () => {
  assert.match(app, /registerViewLoader\(\(key\) => \(VIEW_COMPONENTS\[key\]\?\.__asyncLoader \?\? VIEW_LOADERS\[key\]\)\?\.\(\) \?\? Promise\.resolve\(\)\)/)
})
