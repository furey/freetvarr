import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listenForAirplay, AVAILABILITY_EVENT, WIRELESS_EVENT } from '../src/web/airplay-target.js'

const fakeVideo = ({ wireless = false } = {}) => {
  const video = new EventTarget()
  video.webkitCurrentPlaybackTargetIsWireless = wireless
  return video
}

const availabilityEvent = (availability) => Object.assign(new Event(AVAILABILITY_EVENT), { availability })

const setWireless = (video, wireless) => {
  video.webkitCurrentPlaybackTargetIsWireless = wireless
  video.dispatchEvent(new Event(WIRELESS_EVENT))
}

test('the availability event shows and hides the AirPlay button', () => {
  const video = fakeVideo()
  const state = { airplay: false, playingOnTv: false }
  listenForAirplay({ video, state })
  video.dispatchEvent(availabilityEvent('available'))
  assert.equal(state.airplay, true)
  video.dispatchEvent(availabilityEvent('not-available'))
  assert.equal(state.airplay, false)
})

test('the wireless event turns the on-TV state on and off', () => {
  const video = fakeVideo()
  const state = { airplay: true, playingOnTv: false }
  listenForAirplay({ video, state })
  setWireless(video, true)
  assert.equal(state.playingOnTv, true)
  setWireless(video, false)
  assert.equal(state.playingOnTv, false)
})

test('listening picks up a TV that already plays', () => {
  const state = { airplay: false, playingOnTv: false }
  listenForAirplay({ video: fakeVideo({ wireless: true }), state })
  assert.equal(state.playingOnTv, true)
})

test('closing the player clears the on-TV state, and opening reads it again', () => {
  const video = fakeVideo({ wireless: true })
  const state = { airplay: true, playingOnTv: false }
  const listener = listenForAirplay({ video, state })
  listener.syncOpen(false)
  assert.equal(state.playingOnTv, false)
  listener.syncOpen(true)
  assert.equal(state.playingOnTv, true)
})

test('stopping removes both listeners', () => {
  const video = fakeVideo()
  const state = { airplay: false, playingOnTv: false }
  listenForAirplay({ video, state }).stop()
  video.dispatchEvent(availabilityEvent('available'))
  setWireless(video, true)
  assert.deepEqual(state, { airplay: false, playingOnTv: false })
})
