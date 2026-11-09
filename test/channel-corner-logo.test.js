import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = (path) => fs.readFileSync(new URL(`../src/web/${path}`, import.meta.url), 'utf8')

test('the title fallback shows the channel logo in a corner only where the card has no logo of its own', () => {
  assert.match(source('components/title-art.js'), /<channel-corner-logo :channel-id="channelId" \/>/)
  assert.match(source('components/images.js'), /<channel-corner-logo :channel-id="cornerChannelId" \/>/)
  assert.match(source('components/for-you-parts.js'), /:channel-id="showsLogo \? null : item\.channelId"/)
  assert.match(source('views/home-view.js'), /:corner-channel-id="r\.channelId"/)
  const onNowCard = source('views/home-view.js').split('home-on-now-card')[1].split('</menu-card>')[0]
  assert.doesNotMatch(onNowCard, /corner-channel-id/)
  assert.doesNotMatch(source('views/live-view.js'), /corner-channel-id/)
  assert.doesNotMatch(source('views/epg-view.js'), /corner-channel-id/)
})
