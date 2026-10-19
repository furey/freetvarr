import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAYER_MUTED_KEY,
  loadPlayerMuted,
  savePlayerMuted,
  muteButtonOf,
  playerMenuItemsOf,
} from '../src/web/player-mute.js'
import { initialMultiView, isMutedIn } from '../src/web/multi-view.js'

const memoryStorage = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value }, data }
}

const brokenStorage = () => ({
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('blocked') },
})

test('the mute choice is stored under freetvarr.playerMuted', () => {
  const storage = memoryStorage()
  savePlayerMuted(storage, true)
  assert.equal(PLAYER_MUTED_KEY, 'freetvarr.playerMuted')
  assert.equal(storage.data[PLAYER_MUTED_KEY], '1')
  assert.equal(loadPlayerMuted(storage), true)
  savePlayerMuted(storage, false)
  assert.equal(loadPlayerMuted(storage), false)
})

test('the mute choice defaults to sound on when nothing is stored', () => {
  assert.equal(loadPlayerMuted(memoryStorage()), false)
})

test('blocked storage neither throws nor mutes', () => {
  assert.equal(loadPlayerMuted(brokenStorage()), false)
  assert.doesNotThrow(() => savePlayerMuted(brokenStorage(), true))
  assert.equal(loadPlayerMuted(null), false)
})

test('muteButtonOf names the current state and the action', () => {
  assert.deepEqual(muteButtonOf({ muted: false }), { label: 'Sound', audible: true, ariaLabel: 'Sound on. Press to mute' })
  assert.deepEqual(muteButtonOf({ muted: true }), { label: 'Muted', audible: false, ariaLabel: 'Muted. Press to hear sound' })
})

test('the More menu offers pop out only where picture in picture works', () => {
  const keys = (args) => playerMenuItemsOf(args).map((item) => item.key)
  assert.deepEqual(keys({ canPip: true, pipActive: false, fullscreen: false }), ['pip', 'fullscreen'])
  assert.deepEqual(keys({ canPip: false, pipActive: false, fullscreen: false }), ['fullscreen'])
})

test('the More menu labels follow the picture in picture and full screen state', () => {
  const [pop, full] = playerMenuItemsOf({ canPip: true, pipActive: false, fullscreen: false })
  assert.equal(pop.label, 'Pop out (picture in picture)')
  assert.equal(full.label, 'Full screen')
  const [popOpen, fullOpen] = playerMenuItemsOf({ canPip: true, pipActive: true, fullscreen: true })
  assert.equal(popOpen.label, 'Close pop out (picture in picture)')
  assert.equal(fullOpen.label, 'Exit full screen')
})

test('Watch alongside starts with the single player sound state', () => {
  assert.equal(initialMultiView({ muted: false }).audible, 'primary')
  assert.equal(initialMultiView({ muted: true }).audible, null)
  assert.equal(initialMultiView().audible, 'primary')
})

test('the remaining picture keeps its sound state when the other is stopped', () => {
  const heardPrimary = initialMultiView()
  assert.equal(isMutedIn({ audible: heardPrimary.audible, picture: 'primary' }), false)
  assert.equal(isMutedIn({ audible: heardPrimary.audible, picture: 'secondary' }), true)
  const bothMuted = initialMultiView({ muted: true })
  assert.equal(isMutedIn({ audible: bothMuted.audible, picture: 'primary' }), true)
  assert.equal(isMutedIn({ audible: bothMuted.audible, picture: 'secondary' }), true)
})
