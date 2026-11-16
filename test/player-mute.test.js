import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAYER_MUTED_KEY,
  loadPlayerMuted,
  savePlayerMuted,
  muteButtonOf,
  soundToggleOf,
  playerMenuItemsOf,
  baseRowButtonsOf,
  NO_CAPTIONS_ON_CHANNEL,
  CAPTIONS_HIDDEN_BY_INFO_TITLE,
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

test('the player sound button carries its words in the label and tooltip', () => {
  assert.deepEqual(soundToggleOf({ muted: false }), { muted: false, ariaLabel: 'Mute', title: 'Mute (M)' })
  assert.deepEqual(soundToggleOf({ muted: true }), { muted: true, ariaLabel: 'Unmute', title: 'Unmute (M)' })
})

test('the More menu offers pop out only where picture in picture works', () => {
  const keys = (args) => playerMenuItemsOf(args).map((item) => item.key)
  assert.deepEqual(keys({ canPip: true, pipActive: false }), ['pip'])
  assert.deepEqual(keys({ canPip: false, pipActive: false }), [])
})

test('the More menu lists actions that do not fit the bar before pop out', () => {
  const keys = playerMenuItemsOf({ overflow: [{ key: 'series' }, { key: 'minimise' }], canPip: true }).map((item) => item.key)
  assert.deepEqual(keys, ['series', 'minimise', 'pip'])
})

test('the pop out label follows the picture in picture state', () => {
  assert.equal(playerMenuItemsOf({ canPip: true, pipActive: false })[0].label, 'Pop out (picture in picture)')
  assert.equal(playerMenuItemsOf({ canPip: true, pipActive: true })[0].label, 'Close pop out (picture in picture)')
})

test('the Captions button dims with a reason when it cannot work', () => {
  const none = baseRowButtonsOf({ hasCaptions: false, noCaptionsTitle: NO_CAPTIONS_ON_CHANNEL }).captions
  assert.deepEqual(none, { disabled: true, pressed: false, title: 'No captions on this channel' })
  const hidden = baseRowButtonsOf({ hasCaptions: true, captionsOn: true, infoOpen: true }).captions
  assert.deepEqual(hidden, { disabled: true, pressed: false, title: CAPTIONS_HIDDEN_BY_INFO_TITLE })
  const on = baseRowButtonsOf({ hasCaptions: true, captionsOn: true }).captions
  assert.deepEqual(on, { disabled: false, pressed: true, title: 'Captions (C)' })
  assert.equal(baseRowButtonsOf({ hasCaptions: true, captionsOn: false }).captions.pressed, false)
})

test('the Info button shows expanded while the panel is open', () => {
  assert.deepEqual(baseRowButtonsOf({ infoOpen: true }).info, { expanded: true, title: 'Programme info (I)' })
  assert.equal(baseRowButtonsOf({ infoOpen: false }).info.expanded, false)
})

test('the Full screen button names the action it takes', () => {
  assert.deepEqual(baseRowButtonsOf({ fullscreen: false }).fullscreen, { ariaLabel: 'Full screen', title: 'Full screen (F)', icon: 'fullscreen-icon' })
  assert.deepEqual(baseRowButtonsOf({ fullscreen: true }).fullscreen, { ariaLabel: 'Exit full screen', title: 'Exit full screen (F)', icon: 'exit-fullscreen-icon' })
})

test('Multiview starts with the single player sound state', () => {
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
