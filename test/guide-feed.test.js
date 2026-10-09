import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { Readable } from 'node:stream'

import {
  createRequestWatch,
  createShiftedFeedStream,
  guideFeedUrl,
  isGuideFeedUrl,
  localAddressToward,
  serveShiftedFeed,
  shiftXmltvTime,
} from '../src/guide-feed.js'
import { countUpcomingProgrammes, parseFeedChannels } from '../src/tvheadend-guide.js'

const HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="mjh-10-nsw">
    <display-name>10</display-name>
    <lcn>10</lcn>
    <icon src="https://example.test/10.png"/>
  </channel>
  <channel id="mjh-abc-nsw">
    <display-name>ABC TV</display-name>
  </channel>
  `

const programme = ({ channel, start, stop, title }) =>
  `<programme start="${start}" stop="${stop}" channel="${channel}">\n    <title>${title}</title>\n  </programme>\n  `

const FEED = `${HEAD}${[
  programme({ channel: 'mjh-10-nsw', start: '20261009223000 +0000', stop: '20261009233000 +0000', title: 'The Project' }),
  programme({ channel: 'mjh-10-nsw', start: '20261009233000 +0000', stop: '20261010003000 +0000', title: 'Gogglebox – Café' }),
  programme({ channel: 'mjh-abc-nsw', start: '20261009223000 +0000', stop: '20261009233000 +0000', title: 'News' }),
].join('')}</tv>\n`

const TEN_PLUS_ONE = { id: 'mjh-10-nsw.plus1', baseId: 'mjh-10-nsw', hours: 1, names: ['10 HD +1'], lcn: 14 }

const shiftFeed = async ({ xml, shifts, chunkBytes = 7 }) => {
  const planned = []
  const bytes = Buffer.from(xml)
  const chunks = Array.from({ length: Math.ceil(bytes.length / chunkBytes) }, (_, i) =>
    bytes.subarray(i * chunkBytes, (i + 1) * chunkBytes))
  const stream = Readable.from(chunks).pipe(createShiftedFeedStream({
    planShifts: async (feedChannels) => {
      planned.push(feedChannels)
      return shifts
    },
  }))
  let out = ''
  for await (const chunk of stream) out += chunk
  return { out, planned }
}

test('shiftXmltvTime moves a time by whole hours and keeps its offset', () => {
  const hour = 60 * 60_000
  assert.equal(shiftXmltvTime({ value: '20261009233000 +0000', ms: hour }), '20261010003000 +0000')
  assert.equal(shiftXmltvTime({ value: '20261231233000 +1100', ms: hour }), '20270101003000 +1100')
  assert.equal(shiftXmltvTime({ value: '20261009200000 -0500', ms: 2 * hour }), '20261009220000 -0500')
  assert.equal(shiftXmltvTime({ value: '20261009233000', ms: hour }), '20261010003000')
  assert.equal(shiftXmltvTime({ value: 'soon', ms: hour }), 'soon')
})

test('createShiftedFeedStream adds a +1 channel and a copy of each base programme one hour later', async () => {
  const { out, planned } = await shiftFeed({ xml: FEED, shifts: [TEN_PLUS_ONE] })
  assert.deepEqual(planned[0].map((f) => f.id), ['mjh-10-nsw', 'mjh-abc-nsw'])
  assert.deepEqual(parseFeedChannels(out).at(-1), { id: 'mjh-10-nsw.plus1', names: ['10 HD +1'], lcn: 14 })
  assert.ok(out.includes('<channel id="mjh-10-nsw.plus1">\n    <display-name>10 HD +1</display-name>\n    <lcn>14</lcn>\n    <icon src="https://example.test/10.png"/>\n  </channel>'))
  assert.ok(out.indexOf('mjh-10-nsw.plus1') < out.indexOf('<programme'))
  assert.ok(out.includes('<programme start="20261009233000 +0000" stop="20261010003000 +0000" channel="mjh-10-nsw.plus1">\n    <title>The Project</title>'))
  assert.ok(out.includes('<programme start="20261010003000 +0000" stop="20261010013000 +0000" channel="mjh-10-nsw.plus1">\n    <title>Gogglebox – Café</title>'))
  const counts = countUpcomingProgrammes({ xml: out, nowMs: 0 })
  assert.deepEqual([...counts], [['mjh-10-nsw', 2], ['mjh-10-nsw.plus1', 2], ['mjh-abc-nsw', 1]])
  assert.ok(out.endsWith('</tv>\n'))
})

test('createShiftedFeedStream passes the feed through unchanged when no channel needs a shift', async () => {
  const { out } = await shiftFeed({ xml: FEED, shifts: [], chunkBytes: 3 })
  assert.equal(out, FEED)
})

test('createShiftedFeedStream copies a self-closing programme on its own', async () => {
  const xml = `${HEAD}<programme start="20261009223000 +0000" stop="20261009233000 +0000" channel="mjh-10-nsw"/>\n  ${
    programme({ channel: 'mjh-abc-nsw', start: '20261009223000 +0000', stop: '20261009233000 +0000', title: 'News' })}</tv>`
  const { out } = await shiftFeed({ xml, shifts: [TEN_PLUS_ONE] })
  assert.ok(out.includes('<programme start="20261009233000 +0000" stop="20261010003000 +0000" channel="mjh-10-nsw.plus1"/>'))
  assert.equal(out.match(/channel="mjh-abc-nsw"/g).length, 1)
})

test('serveShiftedFeed answers with the shifted feed as XML', async () => {
  const server = http.createServer((req, res) => serveShiftedFeed({
    sourceUrl: 'https://i.mjh.nz/au/Sydney/epg.xml',
    res,
    planShifts: async () => [TEN_PLUS_ONE],
    openFeed: async () => Readable.from([FEED]),
  }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/guide/xmltv.xml`)
    assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8')
    assert.ok((await response.text()).includes('channel="mjh-10-nsw.plus1"'))
  } finally {
    server.close()
  }
})

test('localAddressToward finds the address Freetvarr uses to reach TVHeadend', async () => {
  const server = http.createServer((req, res) => res.end())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    assert.equal(await localAddressToward(`http://127.0.0.1:${server.address().port}`), '127.0.0.1')
  } finally {
    server.close()
  }
  await assert.rejects(localAddressToward('http://127.0.0.1:1'))
})

test('guideFeedUrl builds the address TVHeadend downloads the guide from', () => {
  assert.equal(guideFeedUrl({ address: '192.168.86.254', port: 3733 }), 'http://192.168.86.254:3733/guide/xmltv.xml')
  assert.equal(guideFeedUrl({ address: '::ffff:127.0.0.1', port: 3733 }), 'http://127.0.0.1:3733/guide/xmltv.xml')
  assert.equal(guideFeedUrl({ address: '::1', port: 3733 }), 'http://[::1]:3733/guide/xmltv.xml')
})

test('isGuideFeedUrl tells the Freetvarr guide address from a guide source', () => {
  assert.equal(isGuideFeedUrl('http://127.0.0.1:3733/guide/xmltv.xml'), true)
  assert.equal(isGuideFeedUrl('https://i.mjh.nz/au/Sydney/epg.xml'), false)
  assert.equal(isGuideFeedUrl(''), false)
  assert.equal(isGuideFeedUrl(undefined), false)
})

test('createRequestWatch reports a guide request that arrives in time', async () => {
  let t = 100
  const watch = createRequestWatch({ now: () => t })
  const waiting = watch.waitSince({ since: 100, limitMs: 1000 })
  t = 150
  watch.note()
  assert.equal(await waiting, true)
  assert.equal(await watch.waitSince({ since: 120, limitMs: 1000 }), true)
  assert.equal(await watch.waitSince({ since: 200, limitMs: 5 }), false)
})
