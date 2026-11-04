import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const welcome = readFileSync(new URL('../src/web/views/welcome-view.js', import.meta.url), 'utf8')
const guideStep = readFileSync(new URL('../src/web/views/guide-setup-step.js', import.meta.url), 'utf8')

const nextBody = () => {
  const start = welcome.indexOf('const next = async () => {')
  return welcome.slice(start, welcome.indexOf('\n    }\n', start))
}

test('setup wizard: Next on the TVHeadend step waits for the open-access check and stops on the Secure form', () => {
  const next = nextBody()
  assert.match(next, /\} else if \(from === 2\) \{\n\s*await settleBootstrap\(\)\n\s*if \(showSecure\.value\) return\n\s*const connected = await testTvh\(\)/)
  assert.match(welcome, /const settleBootstrap = async \(\) => \{\n\s*const url = tvhUrl\.value\.trim\(\)\n\s*if \(!url \|\| bootstrap\.value\) return\n\s*clearTimeout\(bootstrapCheckTimer\)\n\s*bootstrapCheck \?\?= readBootstrap\(url\)\n\s*await bootstrapCheck/)
})

test('setup wizard: a rail jump during a save keeps the jumped step instead of moving one past it', () => {
  const next = nextBody()
  assert.match(next, /const from = step\.value/)
  assert.match(next, /if \(step\.value === from\) step\.value = from \+ 1/)
  assert.doesNotMatch(next, /step\.value\+\+/)
})

test('guide step: Save guide choices shows a failure, blocks a double press, and still throws for the wizard', () => {
  assert.match(guideStep, /<p v-if="linksError && !actionInBar" class="setup-hint is-error">\{\{ linksError \}\}<\/p>/)
  assert.match(guideStep, /:disabled="savingLinks"[^>]*@click="saveLinksHere">Save guide choices<\/button>/)
  assert.match(guideStep, /if \(!pickedCount\.value \|\| savingLinks\.value\) return/)
  assert.match(guideStep, /linksError\.value = `Could not save the guide choices: \$\{err\.message\}`\n\s*throw err/)
  assert.match(guideStep, /const saveLinksHere = \(\) => saveLinks\(\)\.catch\(\(\) => \{\}\)/)
})
