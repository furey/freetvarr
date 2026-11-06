import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-autorec-match-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')
process.env.TZ = 'Australia/Sydney'

const { sameShowSuffixOf, anchorAutorecTitle, anchoredTitlesOf, autorecMatchFieldsOf, autorecMatchesAiring, isSameShowTitle, literalTitleOf } = await import('../src/autorec-match.js')
const { enableSeriesTag, listAutorecs, newAutorecConfOf, setSeriesTitleVariants } = await import('../src/tvheadend.js')
const { db, setSetting, deleteSetting } = await import('../src/db.js')

before(() => db.migrate.latest())

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const CHANNEL = 'c1'
const LEGACY_SUFFIX = '( ?[:(-].*)?$'
const SAME_SHOW_SUFFIX = sameShowSuffixOf('au')
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
  assert.equal(anchored('The Chase'), `^The Chase${SAME_SHOW_SUFFIX}`)
  assert.equal(anchored('Mr. Bean (1990)?'), `^Mr\\. Bean \\(1990\\)\\?${SAME_SHOW_SUFFIX}`)
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

const withTvh = async (run, { autorecs = [], creates = [], saves = [] } = {}) => {
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://tvh')
    let body = ''
    for await (const chunk of req) body += chunk
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (pathname === '/api/dvr/autorec/grid') return res.end(JSON.stringify({ entries: autorecs }))
    if (pathname === '/api/dvr/config/grid') return res.end(JSON.stringify({ entries: [{ uuid: 'cfg', name: '' }] }))
    if (pathname === '/api/idnode/save') {
      saves.push(JSON.parse(new URLSearchParams(body).get('node')))
      return res.end('{}')
    }
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


test('the anchored suffix leaves out a foreign edition tag after a colon, a bracket, or a dash', () => {
  const rule = ruleOf(anchored('Say Yes To The Dress'))
  const matches = (title) => autorecMatchesAiring({ autorec: rule, programme: programmeOf(title) })
  assert.equal(matches('Say Yes To The Dress'), true)
  assert.equal(matches('Say Yes To The Dress: Atlanta'), true)
  assert.equal(matches('Say Yes To The Dress: UK'), false)
  assert.equal(matches('Say Yes To The Dress (US)'), false)
  assert.equal(matches('Say Yes To The Dress - USA'), false)
  assert.equal(matches('say yes to the dress (usa)'), false)
  assert.equal(matches('Say Yes To The Dress: South Africa'), true)
  assert.equal(matches('say yes to the dress (ireland)'), true)
  assert.equal(matches('Say Yes To The Dress: UK Special'), true)
  assert.equal(matches('Say Yes To The Dress (USA 2019)'), true)
  assert.equal(matches('Say Yes To The Dress: Uk-ish'), true)
})

test('the anchored suffix still matches a subtitle that only starts like a country', () => {
  const rule = ruleOf(anchored('Play School'))
  const matches = (title) => autorecMatchesAiring({ autorec: rule, programme: programmeOf(title) })
  assert.equal(matches('Play School: Rainforest Rangers'), true)
  assert.equal(matches('Play School: Indian Summer'), true)
  assert.equal(matches('Play School: Us Two'), true)
  assert.equal(matches('Play School (Canadas Day)'), true)
  assert.equal(matches('The Voice (US)'), false)
})

test('a destination after the title still matches: only UK, US, and USA mark a foreign edition', () => {
  const travel = ruleOf(anchored('Travel Guides'))
  const escape = ruleOf(anchored('Escape to the Country'))
  assert.equal(autorecMatchesAiring({ autorec: travel, programme: programmeOf('Travel Guides: Canada') }), true)
  assert.equal(autorecMatchesAiring({ autorec: travel, programme: programmeOf('Travel Guides: India') }), true)
  assert.equal(autorecMatchesAiring({ autorec: travel, programme: programmeOf('Travel Guides - South Africa') }), true)
  assert.equal(autorecMatchesAiring({ autorec: escape, programme: programmeOf('Escape to the Country: Ireland') }), true)
  assert.equal(autorecMatchesAiring({ autorec: escape, programme: programmeOf('Escape to the Country (UK)') }), false)
})

test('an old-form rule with a hand-made alternation is not read as title variants', () => {
  const pattern = `^(Foo|Bar)${LEGACY_SUFFIX}`
  assert.equal(anchoredTitlesOf(pattern), null)
  assert.equal(literalTitleOf(pattern), null)
  assert.deepEqual(anchoredTitlesOf(`^(Foo|Bar)${SAME_SHOW_SUFFIX}`).titles, ['Foo', 'Bar'])
})

test('listAutorecs: an old-form alternation rule keeps its raw title as its name and key', async () => {
  const autorecs = [{ uuid: 'r1', title: `^(Foo|Bar)${LEGACY_SUFFIX}`, name: 'Foo', channel: CHANNEL, comment: 'freetvarr' }]
  const [rule] = await withTvh((conn) => listAutorecs(conn), { autorecs })
  assert.equal(rule.name, `^(Foo|Bar)${LEGACY_SUFFIX}`)
  assert.equal(rule.seriesLinkId, `${CHANNEL}|^(foo|bar)${LEGACY_SUFFIX}`)
  assert.deepEqual(rule.titleVariants, [])
  assert.equal(rule.titleEditable, false)
})

test('a rule anchored by 2.9.0 still matches foreign editions until it is re-anchored', () => {
  const rule = ruleOf(`^Say Yes To The Dress${LEGACY_SUFFIX}`)
  assert.equal(autorecMatchesAiring({ autorec: rule, programme: programmeOf('Say Yes To The Dress: UK') }), true)
  assert.deepEqual(anchoredTitlesOf(`^Say Yes To The Dress${LEGACY_SUFFIX}`), { titles: ['Say Yes To The Dress'], excludedTags: [] })
})

test('a rule with a title variant records both titles and nothing else', () => {
  const rule = ruleOf(anchorAutorecTitle('Big Brother', ['Big Brother Australia']))
  const matches = (title) => autorecMatchesAiring({ autorec: rule, programme: programmeOf(title) })
  assert.equal(matches('Big Brother'), true)
  assert.equal(matches('Big Brother Australia'), true)
  assert.equal(matches('Big Brother Australia: Live Eviction'), true)
  assert.equal(matches('Big Brother: UK'), false)
  assert.equal(matches('Big Brother Australian'), false)
  assert.equal(matches('Celebrity Big Brother'), false)
})

test('a rule without the variant keeps The Chase and The Chase Australia apart', () => {
  const rule = ruleOf(anchored('The Chase'))
  assert.equal(autorecMatchesAiring({ autorec: rule, programme: programmeOf('The Chase Australia') }), false)
  const australia = ruleOf(anchored('The Chase Australia'))
  assert.equal(autorecMatchesAiring({ autorec: australia, programme: programmeOf('The Chase') }), false)
})

test('anchorAutorecTitle: variants join the title as a group, without repeats, and read back as the primary name', () => {
  const pattern = anchorAutorecTitle('Big Brother', ['Big Brother Australia', 'big brother australia', 'Big Brother', ''])
  assert.equal(pattern, `^(Big Brother|Big Brother Australia)${SAME_SHOW_SUFFIX}`)
  assert.equal(literalTitleOf(pattern), 'Big Brother')
  assert.deepEqual(anchoredTitlesOf(pattern), { titles: ['Big Brother', 'Big Brother Australia'], excludedTags: ['UK', 'US', 'USA'] })
  const tricky = anchorAutorecTitle('A|B', ['A|B (2026)', 'Q+A'])
  assert.deepEqual(anchoredTitlesOf(tricky).titles, ['A|B', 'A|B (2026)', 'Q+A'])
  assert.equal(literalTitleOf(`^(Big Brother|Big.*)${SAME_SHOW_SUFFIX}`), null)
  assert.equal(literalTitleOf(`^(Big Brother)${SAME_SHOW_SUFFIX}`), null)
})

test('the anchored pattern stays POSIX-safe: no lookaround, no lazy or possessive quantifiers, no empty branches', () => {
  const pattern = anchorAutorecTitle('Big Brother', ['Big Brother Australia'])
  assert.doesNotMatch(pattern, /\(\?|\*\?|\+\?|\*\+|\(\||\|\||\|\)|\\[dswb]/i)
  assert.ok(pattern.length < 250)
})

test('the anchored pattern and isSameShowTitle agree on foreign edition tags', () => {
  const tags = ['UK', 'US', 'USA', 'Canada', 'India', 'South Africa', 'Ireland', 'Uk', 'U', 'USB', 'USAF', 'South', 'Australia']
  const forms = (tag) => [`: ${tag}`, `:${tag}`, ` (${tag})`, `(${tag})`, ` - ${tag}`, `-${tag}`, ` (${tag}`, `: ${tag})`, `:  ${tag}`, `: ${tag} `, ` (${tag}) Special`]
  const pattern = new RegExp(anchorAutorecTitle('Show'), 'i')
  for (const tag of tags) {
    for (const form of forms(tag)) {
      const subject = `Show${form}`
      assert.equal(pattern.test(subject), isSameShowTitle({ title: subject, show: 'Show' }), subject)
    }
  }
})

test('listAutorecs: a rule with a variant keeps its primary name and series key, and lists the variant', async () => {
  const autorecs = [{ uuid: 'r1', title: anchorAutorecTitle('Big Brother', ['Big Brother Australia']), name: 'Big Brother', channel: CHANNEL, comment: 'freetvarr' }]
  const [rule] = await withTvh((conn) => listAutorecs(conn), { autorecs })
  assert.equal(rule.name, 'Big Brother')
  assert.equal(rule.seriesLinkId, `${CHANNEL}|big brother`)
  assert.deepEqual(rule.titleVariants, ['Big Brother Australia'])
  assert.equal(rule.titleEditable, true)
})

test('setSeriesTitleVariants: saves the new title to each rule and refuses a rule changed in TVHeadend', async () => {
  const saves = []
  const autorecs = [
    { uuid: 'sd', title: anchorAutorecTitle('Big Brother'), name: 'Big Brother', channel: CHANNEL, comment: 'freetvarr' },
    { uuid: 'hd', title: `^Big Brother${LEGACY_SUFFIX}`, name: 'Big Brother', channel: 'c2', comment: 'freetvarr' },
    { uuid: 'own', title: 'Hard Quiz|Hard Quiz Kids', name: 'Hard Quiz', channel: CHANNEL, comment: 'freetvarr' },
  ]
  await withTvh((conn) => setSeriesTitleVariants({ seriesLinkIds: [`${CHANNEL}|big brother`, 'c2|big brother'], variants: ['Big Brother Australia'], conn }), { autorecs, saves })
  assert.deepEqual(saves, [
    { uuid: 'sd', title: anchorAutorecTitle('Big Brother', ['Big Brother Australia']) },
    { uuid: 'hd', title: anchorAutorecTitle('Big Brother', ['Big Brother Australia']) },
  ])
  await assert.rejects(
    withTvh((conn) => setSeriesTitleVariants({ seriesLinkIds: ['own'], variants: ['Hard Quiz Kids'], conn }), { autorecs, saves }),
    /changed in TVHeadend/,
  )
  assert.equal(saves.length, 2)
})

test('enableSeriesTag: a new rule includes the saved title variants', async () => {
  const creates = []
  await withTvh(
    () => enableSeriesTag({ seriesLink: `${CHANNEL}|big brother`, channelId: CHANNEL, title: 'Big Brother', variants: ['Big Brother Australia'] }),
    { creates },
  )
  assert.equal(creates[0].title, anchorAutorecTitle('Big Brother', ['Big Brother Australia']))
  assert.equal(creates[0].name, 'Big Brother')
})

const AU_SUFFIX_2_10_1 = '( ?[:(-]([^Uu ].*|U([^KkSs].*|K([^)].*|\\).+)|S([^)Aa].*|\\).+|A([^)].*|\\).+)))?| ([^Uu].*|U([^KkSs].*|K([^)].*|\\).+)|S([^)Aa].*|\\).+|A([^)].*|\\).+)))?)?)?)?$'

test('an Australian or New Zealand install sends the same series rule title as 2.10.1', () => {
  assert.equal(anchorAutorecTitle('The Chase', [], 'au'), `^The Chase${AU_SUFFIX_2_10_1}`)
  assert.equal(anchorAutorecTitle('Big Brother', ['Big Brother Australia'], 'au'), `^(Big Brother|Big Brother Australia)${AU_SUFFIX_2_10_1}`)
  assert.equal(anchorAutorecTitle('The Chase', [], 'nz'), `^The Chase${AU_SUFFIX_2_10_1}`)
  assert.equal(anchorAutorecTitle('The Chase'), `^The Chase${AU_SUFFIX_2_10_1}`)
})

const COUNTRY_EDITIONS = [
  { country: 'au', recorded: ['Australia', 'AU', 'NZ'], skipped: ['UK', 'US', 'USA'] },
  { country: 'nz', recorded: ['NZ', 'AUS', 'Australia'], skipped: ['UK', 'US', 'USA'] },
  { country: 'uk', recorded: ['UK', 'Canada', 'Ireland'], skipped: ['US', 'USA', 'AU', 'AUS', 'NZ'] },
  { country: 'us', recorded: ['US', 'USA', 'Canada'], skipped: ['UK', 'AU', 'AUS', 'NZ'] },
  { country: 'de', recorded: ['Germany', 'Canada', 'India'], skipped: ['UK', 'US', 'USA', 'AU', 'AUS', 'NZ'] },
  { country: '', recorded: ['UK', 'US', 'USA', 'AU', 'NZ', 'Canada'], skipped: [] },
]

test('each install country records its own edition and skips the short tags of other countries', () => {
  for (const { country, recorded, skipped } of COUNTRY_EDITIONS) {
    const rule = ruleOf(anchorAutorecTitle('Say Yes To The Dress', [], country))
    const matches = (title) => autorecMatchesAiring({ autorec: rule, programme: programmeOf(title) })
    assert.equal(matches('Say Yes To The Dress'), true, country)
    assert.equal(matches('Say Yes To The Dress: Atlanta'), true, country)
    for (const tag of recorded) assert.equal(matches(`Say Yes To The Dress: ${tag}`), true, `${country} ${tag}`)
    for (const tag of skipped) {
      assert.equal(matches(`Say Yes To The Dress: ${tag}`), false, `${country} ${tag}`)
      assert.equal(matches(`Say Yes To The Dress (${tag})`), false, `${country} (${tag})`)
      assert.equal(matches(`Say Yes To The Dress: ${tag} Special`), true, `${country} ${tag} Special`)
    }
  }
})

test('the series rule title follows the time zone of the install', () => {
  const zone = process.env.TZ
  try {
    process.env.TZ = 'Europe/London'
    assert.equal(anchorAutorecTitle('The Chase'), anchorAutorecTitle('The Chase', [], 'uk'))
    assert.equal(isSameShowTitle({ title: 'The Chase: UK', show: 'The Chase' }), true)
    process.env.TZ = 'America/New_York'
    assert.equal(isSameShowTitle({ title: 'The Chase: UK', show: 'The Chase' }), false)
    assert.equal(isSameShowTitle({ title: 'The Chase (US)', show: 'The Chase' }), true)
    process.env.TZ = 'Asia/Tokyo'
    assert.equal(anchorAutorecTitle('The Chase'), '^The Chase( ?[-:(].*)?$')
  } finally {
    process.env.TZ = zone
  }
})

test('every country form reads back as the same titles and agrees with isSameShowTitle', () => {
  const subjects = ['Show', 'Show: UK', 'Show (US)', 'Show (USA', 'Show - AU', 'Show:AUS', 'Show: NZ)', 'Show: UKraine', 'Show: Canada', 'Show:', 'Show (2026)', 'Shows', 'Show UK']
  for (const { country } of COUNTRY_EDITIONS) {
    const pattern = anchorAutorecTitle('Show', ['Show Two'], country)
    const anchored = anchoredTitlesOf(pattern)
    assert.deepEqual(anchored.titles, ['Show', 'Show Two'], country)
    assert.equal(literalTitleOf(pattern), 'Show', country)
    assert.equal(literalTitleOf(anchorAutorecTitle('Mr. Bean (1990)?', [], country)), 'Mr. Bean (1990)?', country)
    assert.doesNotMatch(pattern, /\(\?|\*\?|\+\?|\*\+|\(\||\|\||\|\)|\\[dswb]/i)
    const regex = new RegExp(pattern, 'i')
    for (const subject of subjects) {
      const expected = isSameShowTitle({ title: subject, show: 'Show', excludedTags: anchored.excludedTags })
      assert.equal(regex.test(subject), expected, `${country} ${subject}`)
    }
  }
})
