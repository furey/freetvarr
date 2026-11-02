import { test, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WEB_ROOT = fileURLToPath(new URL('../src/web', import.meta.url))
const VUE = fileURLToPath(new URL('../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url))
const API_STUB = `data:text/javascript,${encodeURIComponent('export const api = (...args) => globalThis.ratingsApi(...args)')}`

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const fromWeb = context.parentURL?.startsWith(pathToFileURL(WEB_ROOT).href)
    if (!fromWeb || !specifier.startsWith('/')) return nextResolve(specifier, context)
    if (specifier === '/vendor/vue.esm-browser.prod.js') return nextResolve(pathToFileURL(VUE).href, context)
    if (specifier === '/shared/api.js') return nextResolve(API_STUB, context)
    return nextResolve(pathToFileURL(`${WEB_ROOT}${specifier}`).href, context)
  },
})

const { ref } = await import(pathToFileURL(VUE).href)
const { useProgrammeRatings } = await import('../src/web/components/programme-ratings.js')

const answers = new Map()

const answerFor = (url) => {
  if (!answers.has(url)) answers.set(url, Promise.withResolvers())
  return answers.get(url).promise
}

const reply = (title, score) => {
  const url = [...answers.keys()].find((key) => key.includes(`title=${encodeURIComponent(title)}&`))
  answers.get(url).resolve({ status: 'ready', score, source: 'tmdb', votes: 500 })
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

const advance = async (ms) => {
  mock.timers.tick(ms)
  await flush()
}

let titleSeed = 0

const film = (name) => ({ title: `${name} ${titleSeed}`, kind: 'movie', ratingsLikely: true })

const opened = async (programme) => {
  const shown = ref(programme)
  const ratings = useProgrammeRatings(shown)
  await flush()
  return { shown, ratings }
}

beforeEach(() => {
  titleSeed += 1
  answers.clear()
  globalThis.ratingsApi = (method, url) => answerFor(url)
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
})

afterEach(() => mock.timers.reset())

test('rating dots: a score before the dots show applies at once with no hold', async () => {
  const programme = film('Early')
  const { ratings } = await opened(programme)
  await advance(100)
  reply(programme.title, 7.4)
  await flush()
  assert.equal(ratings.score.value?.label, '7.4')
  assert.equal(ratings.loading.value, false)
  await advance(1000)
  assert.equal(ratings.loading.value, false)
})

test('rating dots: a score 50 ms after the dots show holds them for the rest of 600 ms', async () => {
  const programme = film('Held')
  const { ratings } = await opened(programme)
  await advance(300)
  assert.equal(ratings.loading.value, true)
  await advance(50)
  reply(programme.title, 8.1)
  await flush()
  await advance(549)
  assert.equal(ratings.score.value, null)
  assert.equal(ratings.loading.value, true)
  await advance(1)
  assert.equal(ratings.score.value?.label, '8.1')
  assert.equal(ratings.loading.value, false)
})

test('rating dots: a score after the dots have shown for 600 ms applies at once', async () => {
  const programme = film('Late')
  const { ratings } = await opened(programme)
  await advance(300)
  assert.equal(ratings.loading.value, true)
  await advance(650)
  reply(programme.title, 6.9)
  await flush()
  assert.equal(ratings.score.value?.label, '6.9')
  assert.equal(ratings.loading.value, false)
})

test("rating dots: opening programme B mid-hold never shows programme A's score", async () => {
  const first = film('First')
  const second = film('Second')
  const { shown, ratings } = await opened(first)
  await advance(350)
  reply(first.title, 9.2)
  await flush()
  assert.equal(ratings.score.value, null)
  shown.value = second
  await flush()
  for (let elapsed = 0; elapsed < 2000; elapsed += 50) {
    await advance(50)
    assert.equal(ratings.score.value, null)
  }
  reply(second.title, 5.5)
  await flush()
  assert.equal(ratings.score.value?.label, '5.5')
})
