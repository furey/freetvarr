import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-autorec-match-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { anchorAutorecTitle, autorecMatchFieldsOf, autorecMatchesAiring, isSameShowTitle, literalTitleOf } = await import('../src/autorec-match.js')
const { enableSeriesTag, listAutorecs, newAutorecConfOf } = await import('../src/tvheadend.js')
const { db, setSetting, deleteSetting } = await import('../src/db.js')

before(() => db.migrate.latest())

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const CHANNEL = 'c1'
const START = Date.UTC(2026, 10, 9, 8, 30)

const programmeOf = (title) => ({ title, channel_id: CHANNEL, start: START, end: START + 3600000 })

const ruleOf = (title) => ({
  id: 'rule',
  channelId: CHANNEL,
  enabled: true,
  match: autorecMatchFieldsOf({ title, weekdays: [1, 2, 3, 4, 5, 6, 7], start: 'Any', start_window: 'Any' }),
})

const anchored = (title) => newAutorecConfOf({ title, channelId: CHANNEL, configName: 'dvr' }).title

test('newAutorecConfOf: anchors the title to the whole show title', () => {
  assert.equal(anchored('The Chase'), '^The Chase( ?[:(-].*)?$')
  assert.equal(anchored('Mr. Bean (1990)?'), '^Mr\\. Bean \\(1990\\)\\?( ?[:(-].*)?$')
})

test('anchored rules match the show and its subtitled titles, not longer show names', () => {
  const rule = ruleOf(anchored('The Chase'))
  const matches = (title) => autorecMatchesAiring({ autorec: rule, programme: programmeOf(title) })
  assert.equal(matches('The Chase'), true)
  assert.equal(matches('the chase'), true)
  assert.equal(matches('The Chase (Ep 5)'), true)
  assert.equal(matches('The Chase: Celebrity Special'), true)
  assert.equal(matches('The Chase - Final'), true)
  assert.equal(matches('Beat The Chase'), false)
  assert.equal(matches('The Chase Australia'), false)
  assert.equal(matches('The Chasers'), false)
})

test('anchored rules for "Friends" skip the other Friends shows', () => {
  const rule = ruleOf(anchored('Friends'))
  const matches = (title) => autorecMatchesAiring({ autorec: rule, programme: programmeOf(title) })
  assert.equal(matches('Friends'), true)
  assert.equal(matches('Thomas & Friends'), false)
  assert.equal(matches('Miffy and Friends'), false)
  assert.equal(matches('Friends Like These'), false)
})

test('literalTitleOf: strips the anchor wrapper and nothing else', () => {
  assert.equal(literalTitleOf('^The Chase( ?[:(-].*)?$'), 'The Chase')
  assert.equal(literalTitleOf('^Mr\\. Bean \\(1990\\)\\?( ?[:(-].*)?$'), 'Mr. Bean (1990)?')
  assert.equal(literalTitleOf('The Chase'), 'The Chase')
  assert.equal(literalTitleOf('^The Chase$'), null)
  assert.equal(literalTitleOf('^The|Chase( ?[:(-].*)?$'), null)
  assert.equal(literalTitleOf('^( ?[:(-].*)?$'), null)
})

test('isSameShowTitle: equal, or followed by a colon, a dash, or a bracket', () => {
  assert.equal(isSameShowTitle({ title: 'Chefs Ahoy: Christmas', show: 'Chefs Ahoy' }), true)
  assert.equal(isSameShowTitle({ title: 'Bluey (2018)', show: 'bluey' }), true)
  assert.equal(isSameShowTitle({ title: 'Survivor', show: 'Survivor' }), true)
  assert.equal(isSameShowTitle({ title: 'Australian Survivor', show: 'Survivor' }), false)
  assert.equal(isSameShowTitle({ title: 'Hard Quiz Kids', show: 'Hard Quiz' }), false)
  assert.equal(isSameShowTitle({ title: 'Anything', show: '' }), false)
})

const withTvh = async (run, { autorecs = [], creates = [] } = {}) => {
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://tvh')
    let body = ''
    for await (const chunk of req) body += chunk
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (pathname === '/api/dvr/autorec/grid') return res.end(JSON.stringify({ entries: autorecs }))
    if (pathname === '/api/dvr/config/grid') return res.end(JSON.stringify({ entries: [{ uuid: 'cfg', name: '' }] }))
    if (pathname === '/api/dvr/autorec/create') {
      creates.push(JSON.parse(new URLSearchParams(body).get('conf')))
      return res.end(JSON.stringify({ uuid: 'new-rule' }))
    }
    res.end('{}')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  await setSetting('tvh_url', url)
  try {
    return await run({ url, username: '', password: '' })
  } finally {
    await deleteSetting('tvh_url')
    server.close()
  }
}

test('listAutorecs: an anchored rule keeps the plain series key', async () => {
  const autorecs = [{ uuid: 'r1', title: '^The Chase( ?[:(-].*)?$', name: 'The Chase', channel: CHANNEL }]
  const [rule] = await withTvh((conn) => listAutorecs(conn), { autorecs })
  assert.equal(rule.seriesLinkId, `${CHANNEL}|the chase`)
  assert.equal(rule.name, 'The Chase')
})

test('enableSeriesTag: finds an existing anchored rule instead of making a second one', async () => {
  const creates = []
  const autorecs = [{ uuid: 'r1', title: '^The Chase( ?[:(-].*)?$', name: 'The Chase', channel: CHANNEL }]
  const result = await withTvh(
    () => enableSeriesTag({ seriesLink: `${CHANNEL}|the chase`, channelId: CHANNEL, title: 'The Chase' }),
    { autorecs, creates },
  )
  assert.equal(result.existed, true)
  assert.deepEqual(creates, [])
})

const TRICKY_TITLES = ["Who's Who: The Quiz", 'Law & Order', 'Law & Order: SVU', 'Mr. Inbetween', '9-1-1', '9-1-1: Lone Star', 'Q+A', 'Q&A', 'The Chase (Celebrity)', '[Untitled]', 'Hey {Brother}', 'Price $1', 'C:\\Path', 'What?!', 'A|B', 'Star*', '^Start', 'End$', 'Dots...', 'Ça va', 'Über Leben', '1 Euro House', 'MKR', 'Friends', 'Back-to-Back', "Grey's Anatomy", 'The 7.30 Report', 'Hard Quiz (Kids)', 'Bluey', 'a(b', 'a)b', 'x]y', 'p\\q', 'Tab\there', '#hash', 'Pct 100%', 'Slash/Name', 'Emoji 📺', 'Mixed [a-z] (1+1)', 'Big Brother']

test('anchored titles read back as the same title, for titles full of regex characters', () => {
  assert.equal(TRICKY_TITLES.length, 40)
  for (const title of TRICKY_TITLES) assert.equal(literalTitleOf(anchorAutorecTitle(title)), title, title)
})

test('the anchored pattern and isSameShowTitle agree on every tricky title', () => {
  for (const title of TRICKY_TITLES) {
    const pattern = new RegExp(anchorAutorecTitle(title), 'iu')
    const subjects = [title, `${title}: Special`, `${title} (Ep 5)`, `${title} - Final`, `${title}-Live`, title.toUpperCase(), `${title} Australia`, `The ${title}`, `${title}s`]
    for (const subject of subjects) assert.equal(pattern.test(subject), isSameShowTitle({ title: subject, show: title }), `${title} / ${subject}`)
  }
})

test('listAutorecs: every tricky anchored title keeps its plain series key', async () => {
  const autorecs = TRICKY_TITLES.map((title, i) => ({ uuid: `r${i}`, title: anchorAutorecTitle(title), name: title, channel: CHANNEL }))
  const rules = await withTvh((conn) => listAutorecs(conn), { autorecs })
  assert.deepEqual(rules.map((rule) => rule.seriesLinkId), TRICKY_TITLES.map((title) => `${CHANNEL}|${title.toLowerCase()}`))
})
