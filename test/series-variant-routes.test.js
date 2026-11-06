import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'

import { setSeriesTitleVariant } from '../src/epg.js'
import { mountSeriesVariantRoutes } from '../src/series-variant-routes.js'

const passThrough = (req, res, next) => next()
const writes = []
let rules = []
let appServer
let baseUrl

const post = async (body) => {
  const res = await fetch(`${baseUrl}/api/epg/series-title-variant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const ruleNamed = (name, titleVariants = []) => ({ id: name, seriesLinkId: `ch|${name.toLowerCase()}`, name, channelId: 'ch', titleVariants })

before(async () => {
  const app = express()
  app.use(express.json())
  mountSeriesVariantRoutes({
    app,
    csrf: passThrough,
    onError: (res, err) => res.status(502).json({ error: err.message }),
    setVariant: (args) => setSeriesTitleVariant({
      ...args,
      loadRules: async () => rules,
      loadVariants: async () => [],
      writeRule: async ({ variants }) => writes.push(['rule', variants]),
      saveVariants: async ({ title, variants }) => writes.push(['save', title, variants]),
    }),
  })
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(() => appServer?.close())

test('POST series-title-variant: turns on a near-match title of the matched series', async () => {
  rules = [ruleNamed('Big Brother')]
  writes.length = 0
  const res = await post({ series_link_ids: ['ch|big brother'], variant: ' Big Brother Australia ', enabled: true })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { ok: true, title: 'Big Brother', variants: ['Big Brother Australia'] })
  assert.deepEqual(writes, [['rule', ['Big Brother Australia']], ['save', 'Big Brother', ['Big Brother Australia']]])
})

test('POST series-title-variant: a title that is not a variant of the series is refused with 400', async () => {
  rules = [ruleNamed('Other')]
  writes.length = 0
  const news = await post({ series_link_ids: ['ch|other'], title: 'Other', variant: 'News', enabled: true })
  assert.equal(news.status, 400)
  assert.equal(news.body.code, 'not-a-variant')
  const claimed = await post({ series_link_ids: ['ch|other'], title: 'Big Brother', variant: 'Big Brother Australia', enabled: true })
  assert.equal(claimed.status, 400)
  assert.deepEqual(writes, [])
})

test('POST series-title-variant: a variant already in the rule can be turned off', async () => {
  rules = [ruleNamed('Hard Quiz', ['HQ Late'])]
  writes.length = 0
  const res = await post({ series_link_ids: ['ch|hard quiz'], variant: 'HQ Late', enabled: false })
  assert.equal(res.status, 200)
  assert.deepEqual(writes, [['rule', []], ['save', 'Hard Quiz', []]])
})

test('POST series-title-variant: refuses a malformed body', async () => {
  for (const body of [
    { variant: 'Big Brother Australia', enabled: true },
    { series_link_ids: [], variant: 'Big Brother Australia', enabled: true },
    { series_link_ids: ['x'], variant: '  ', enabled: true },
    { series_link_ids: ['x'], variant: 'x'.repeat(201), enabled: true },
    { series_link_ids: ['x'], variant: 'Big Brother Australia', enabled: 'yes' },
  ]) assert.equal((await post(body)).status, 400, JSON.stringify(body).slice(0, 60))
})
