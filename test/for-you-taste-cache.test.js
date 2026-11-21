import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WEB_ROOT = fileURLToPath(new URL('../src/web', import.meta.url))
const API_STUB = `data:text/javascript,${encodeURIComponent('export const api = (...args) => globalThis.tasteApi(...args)')}`

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const fromWeb = context.parentURL?.startsWith(pathToFileURL(WEB_ROOT).href)
    if (!fromWeb || !specifier.startsWith('/')) return nextResolve(specifier, context)
    if (specifier === '/shared/api.js') return nextResolve(API_STUB, context)
    return nextResolve(pathToFileURL(`${WEB_ROOT}${specifier}`).href, context)
  },
})

const { forYouTastes, forYouWrite } = await import('../src/web/shared/taste-store.js')

const taste = { enabled: true, hidden: false, category: null }

test('forYouWrite: a hide or settings write drops every cached taste answer', async () => {
  globalThis.tasteApi = async () => ({})
  forYouTastes.set({ title: 'Vera', kind: 'show', taste, startedIn: forYouTastes.generation() })
  await forYouWrite('POST', '/api/events/feedback', { kind: 'not_interested' })
  assert.equal(forYouTastes.get({ title: 'Vera', kind: 'show' }), undefined)
})

test('forYouWrite: a taste fetched while a write is in flight is not cached', async () => {
  const write = Promise.withResolvers()
  globalThis.tasteApi = () => write.promise
  const writing = forYouWrite('DELETE', '/api/for-you/hidden/vera')
  const startedIn = forYouTastes.generation()
  write.resolve({})
  await writing
  assert.equal(forYouTastes.set({ title: 'Vera', kind: 'show', taste, startedIn }), false)
})

test('forYouWrite: a failed write still clears the cache and passes the error on', async () => {
  globalThis.tasteApi = async () => { throw new Error('offline') }
  forYouTastes.set({ title: 'Vera', kind: 'show', taste, startedIn: forYouTastes.generation() })
  await assert.rejects(forYouWrite('PUT', '/api/for-you/settings', {}), /offline/)
  assert.equal(forYouTastes.get({ title: 'Vera', kind: 'show' }), undefined)
})
