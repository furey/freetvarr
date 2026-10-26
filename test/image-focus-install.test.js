import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WEB_ROOT = fileURLToPath(new URL('../src/web', import.meta.url))

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const fromWeb = context.parentURL?.startsWith(pathToFileURL(WEB_ROOT).href)
    if (fromWeb && specifier.startsWith('/')) return nextResolve(pathToFileURL(`${WEB_ROOT}${specifier}`).href, context)
    return nextResolve(specifier, context)
  },
})

globalThis.location = { origin: 'http://nas:3744' }
globalThis.window = { matchMedia: () => ({ matches: true }) }
globalThis.HTMLImageElement = class {}
globalThis.getComputedStyle = () => ({
  objectFit: 'cover',
  objectPosition: '50% 50%',
  transitionDuration: '0s',
  transitionProperty: 'opacity',
  getPropertyValue: () => '',
})

const { installImageFocus, primeImageFocus, rememberImageFocus, showLoadedImage } = await import('../src/web/shared/image-focus.js')

const FACE_LEFT = { x: 0.2, y: 0.425, box: [0.096, 0.184, 0.304, 0.752] }

const fakeImage = (path) => Object.assign(new HTMLImageElement(), {
  src: path,
  currentSrc: `http://nas:3744${path}?w=1280`,
  complete: true,
  isConnected: true,
  naturalWidth: 1280,
  naturalHeight: 720,
  clientWidth: 390,
  clientHeight: 488,
  style: { objectPosition: '' },
  classList: fakeClassList(),
  dispatchEvent: () => true,
})

const fakeClassList = () => {
  const names = new Set()
  return {
    add: (...added) => added.forEach((name) => names.add(name)),
    remove: (...removed) => removed.forEach((name) => names.delete(name)),
    contains: (name) => names.has(name),
  }
}

const fakeRoot = (images = []) => {
  const listeners = new Map()
  return {
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    querySelectorAll: () => images,
    load: (img) => listeners.get('load')({ target: img }),
  }
}

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

test('focus that arrives after the wait cap still places the shown image', async () => {
  const root = fakeRoot()
  const img = fakeImage('/api/recordings/slow/image')
  const fetchFocus = async (keys) => {
    await delay(40)
    return { enabled: true, items: Object.fromEntries(keys.map((key) => [key, FACE_LEFT])) }
  }
  const uninstall = installImageFocus({ root, fetchFocus, waitCapMs: 5 })
  root.load(img)
  await delay(20)
  assert.equal(img.style.objectPosition, '')
  assert.ok(img.classList.contains('is-focus-ready'))
  await delay(60)
  assert.equal(img.style.objectPosition, '0% 50%')
  uninstall()
})

test('supplied focus places the image on load without asking the server', async () => {
  const root = fakeRoot()
  const img = fakeImage('/api/recordings/supplied/image')
  const asked = []
  const uninstall = installImageFocus({ root, fetchFocus: async (keys) => { asked.push(...keys) } })
  rememberImageFocus([{ url: '/api/recordings/supplied/image?w=768', focus: FACE_LEFT }])
  root.load(img)
  assert.equal(img.style.objectPosition, '0% 50%')
  await delay(30)
  assert.deepEqual(asked, [])
  uninstall()
})

test('an image already loaded when focus is installed is placed without a load event', () => {
  rememberImageFocus([{ url: '/api/recordings/early/image', focus: FACE_LEFT }])
  const img = fakeImage('/api/recordings/early/image')
  const uninstall = installImageFocus({ root: fakeRoot([img]), fetchFocus: async () => null })
  assert.equal(img.style.objectPosition, '0% 50%')
  uninstall()
})

test('an image already loaded at mount shows at once and glides to focus that arrives later', async () => {
  const root = fakeRoot()
  const img = fakeImage('/api/recordings/cached/image')
  const fetchFocus = async (keys) => {
    await delay(30)
    return { enabled: true, items: Object.fromEntries(keys.map((key) => [key, FACE_LEFT])) }
  }
  const uninstall = installImageFocus({ root, fetchFocus })
  showLoadedImage(img)
  assert.ok(img.classList.contains('is-focus-ready'))
  assert.ok(!img.classList.contains('is-focus-fading'))
  root.load(img)
  await delay(60)
  assert.equal(img.style.objectPosition, '0% 50%')
  uninstall()
})

test('primed focus is asked once in a batch and lets a later load show without waiting', async () => {
  const root = fakeRoot()
  const asked = []
  const fetchFocus = async (keys) => {
    asked.push(keys)
    return { enabled: true, items: Object.fromEntries(keys.map((key) => [key, FACE_LEFT])) }
  }
  const uninstall = installImageFocus({ root, fetchFocus })
  primeImageFocus(['/api/recordings/a/image?w=384', '/api/recordings/b/image?w=384'])
  primeImageFocus('/api/recordings/a/image?w=768')
  await delay(30)
  assert.deepEqual(asked, [['/api/recordings/a/image', '/api/recordings/b/image']])
  const img = fakeImage('/api/recordings/b/image')
  root.load(img)
  assert.ok(img.classList.contains('is-focus-ready'))
  assert.equal(img.style.objectPosition, '0% 50%')
  uninstall()
})

test('a load while the primed request is out waits for it instead of asking again', async () => {
  const root = fakeRoot()
  const asked = []
  const fetchFocus = async (keys) => {
    asked.push(keys)
    await delay(30)
    return { enabled: true, items: Object.fromEntries(keys.map((key) => [key, FACE_LEFT])) }
  }
  const uninstall = installImageFocus({ root, fetchFocus, waitCapMs: 200 })
  primeImageFocus('/api/recordings/out/image')
  await delay(20)
  const img = fakeImage('/api/recordings/out/image')
  root.load(img)
  assert.ok(!img.classList.contains('is-focus-ready'))
  await delay(40)
  assert.equal(asked.length, 1)
  assert.equal(img.style.objectPosition, '0% 50%')
  assert.ok(img.classList.contains('is-focus-ready'))
  uninstall()
})
