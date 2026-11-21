import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WEB_ROOT = fileURLToPath(new URL('../src/web', import.meta.url))
const VUE = fileURLToPath(new URL('../node_modules/vue/index.mjs', import.meta.url))
const API_STUB = `data:text/javascript,${encodeURIComponent('export const api = async () => null')}`

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const fromWeb = context.parentURL?.startsWith(pathToFileURL(WEB_ROOT).href)
    if (!fromWeb || !specifier.startsWith('/')) return nextResolve(specifier, context)
    if (specifier === '/vendor/vue.esm-browser.prod.js') return nextResolve(pathToFileURL(VUE).href, context)
    if (specifier === '/shared/api.js') return nextResolve(API_STUB, context)
    return nextResolve(pathToFileURL(`${WEB_ROOT}${specifier}`).href, context)
  },
})

const { createSSRApp, h } = await import(pathToFileURL(VUE).href)
const { renderToString } = await import('vue/server-renderer')
const { CastScroller } = await import('../src/web/components/show-credits.js')

const rendered = (cast) => {
  const app = createSSRApp({ render: () => h(CastScroller, { cast }) })
  app.directive('scroll-fade', {})
  return renderToString(app)
}

test('cast tiles carry the full name and role as title text, so clamped lines can still be read', async () => {
  const html = await rendered([{ name: 'Sylvester Gardenzio Stallone', character: 'Robert "Rocky" Balboa, the Italian Stallion', initials: 'SS' }])
  assert.match(html, /class="show-cast-name" title="Sylvester Gardenzio Stallone"/)
  assert.match(html, /class="show-cast-role" title="Robert &quot;Rocky&quot; Balboa, the Italian Stallion"/)
})

test('More info clamps cast names to 2 lines and roles to 3, with a tile height sized for one name line and one role line', () => {
  const css = readFileSync(new URL('../src/web/styles/recordings.css', import.meta.url), 'utf8')
  assert.match(css, /\.more-info \.show-cast-name \{\n {2}-webkit-line-clamp: 2;/)
  assert.match(css, /\.more-info \.show-cast-role \{\n {2}-webkit-line-clamp: 3;/)
  assert.match(css, /\.more-info \.show-cast-hit \{\n {2}min-height: calc\(64px \+ 8px \+ 17px \+ 2px \+ 16px\);/)
})
