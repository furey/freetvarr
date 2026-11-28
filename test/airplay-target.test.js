import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listenForAirplay, airplayReachHintOf, AVAILABILITY_EVENT, WIRELESS_EVENT } from '../src/web/airplay-target.js'

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

test('home-network addresses get no reach hint', () => {
  for (const host of ['192.168.1.10', 'nas', 'nas.local', 'tv.home.arpa', 'nas.lan', 'localhost', '::1', '']) {
    assert.equal(airplayReachHintOf(host), '', host)
  }
})

test('a Tailscale name suggests adding the TV to Tailscale', () => {
  assert.equal(airplayReachHintOf('freetvarr.example.ts.net'),
    "If your TV shows an error, it can't reach this address. Use your home address, or add the TV to Tailscale.")
})

test('other public names suggest the home address only', () => {
  assert.equal(airplayReachHintOf('tv.example.com'), "If your TV shows an error, it can't reach this address. Use your home address.")
})

test('a Tailscale IP address gets the Tailscale hint', () => {
  for (const host of ['100.64.0.10', '100.127.255.254', '100.100.1.2']) {
    assert.equal(airplayReachHintOf(host),
      "If your TV shows an error, it can't reach this address. Use your home address, or add the TV to Tailscale.", host)
  }
  assert.equal(airplayReachHintOf('100.63.0.1'), '')
  assert.equal(airplayReachHintOf('100.128.0.1'), '')
})
