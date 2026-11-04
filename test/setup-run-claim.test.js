import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8')

const routeBody = (path) => {
  const start = server.indexOf(`app.post('${path}'`)
  return server.slice(start, server.indexOf('\n})\n', start))
}

const claimsBeforeFirstAwait = ({ route, run }) => {
  const claim = route.indexOf(`${run} = { running: true, steps: [], result: null }`)
  const firstAwait = route.indexOf('await ')
  return claim > 0 && claim < firstAwait
}

test('channel setup: a second press while TVHeadend is read gets 409, because the run is claimed before the first await', () => {
  const route = routeBody('/api/tvh-setup/apply')
  assert.ok(claimsBeforeFirstAwait({ route, run: 'setupRun' }))
  assert.match(route, /catch \(err\) \{\n\s*setupRun = previousSetupRun\n\s*return res\.status\(502\)/)
  assert.match(route, /if \(!networkId && !transmitter\) \{\n\s*setupRun = previousSetupRun\n\s*return res\.status\(400\)/)
})

test('guide setup: the run is claimed before the first await and handed back on a failed read', () => {
  const route = routeBody('/api/tvh-guide/apply')
  assert.ok(claimsBeforeFirstAwait({ route, run: 'guideRun' }))
  assert.match(route, /catch \(err\) \{\n\s*guideRun = previousGuideRun\n\s*return res\.status\(502\)/)
})
