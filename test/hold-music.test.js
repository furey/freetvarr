import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  audioContextOnce,
  createHoldMusic,
  holdMusicVolume,
  fadeVolume,
  holdMusicToggleLabel,
  loadHoldMusicMuted,
  saveHoldMusicMuted,
  HOLD_MUSIC_MUTED_KEY,
  HOLD_MUSIC_VOLUME,
  FADE_IN_MS,
  FADE_OUT_MS,
} from '../src/web/hold-music.js'

const fakeAudio = ({ rejectPlay = false } = {}) => ({
  paused: true,
  volume: 1,
  loop: false,
  plays: 0,
  play() {
    this.plays += 1
    if (rejectPlay) return Promise.reject(new Error('NotAllowedError'))
    this.paused = false
    return Promise.resolve()
  },
  pause() { this.paused = true },
})

const fakeClock = () => {
  let time = 0
  const timers = new Map()
  let nextId = 1
  return {
    now: () => time,
    schedule: (fn) => {
      const id = nextId++
      timers.set(id, fn)
      return id
    },
    cancel: (id) => timers.delete(id),
    advance(ms) {
      time += ms
      for (const fn of [...timers.values()]) fn()
    },
  }
}

const holdMusicWith = (audio) => {
  const clock = fakeClock()
  const audible = []
  const music = createHoldMusic({
    makeAudio: () => audio,
    onAudibleChange: (on) => audible.push(on),
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: clock.now,
  })
  return { music, clock, audible }
}

test('fadeVolume: moves linearly from the start level to the target', () => {
  assert.equal(fadeVolume({ from: 0, to: 0.3, elapsedMs: 1000, durationMs: 2000 }), 0.15)
})

test('fadeVolume: holds the target once the fade time has passed', () => {
  assert.equal(fadeVolume({ from: 0.3, to: 0, elapsedMs: 5000, durationMs: 3000 }), 0)
})

test('fadeVolume: starts at the start level', () => {
  assert.equal(fadeVolume({ from: 0.2, to: 0, elapsedMs: 0, durationMs: 3000 }), 0.2)
})

test('holdMusicToggleLabel: offers to mute while the music is audible, and to play otherwise', () => {
  assert.equal(holdMusicToggleLabel(true), 'Mute the music')
  assert.equal(holdMusicToggleLabel(false), 'Play the music')
})

test('loadHoldMusicMuted: reads the saved choice and defaults to not muted', () => {
  assert.equal(loadHoldMusicMuted({ getItem: (key) => (key === HOLD_MUSIC_MUTED_KEY ? '1' : null) }), true)
  assert.equal(loadHoldMusicMuted({ getItem: () => null }), false)
  assert.equal(loadHoldMusicMuted({ getItem: () => { throw new Error('blocked') } }), false)
})

test('saveHoldMusicMuted: stores the choice and ignores blocked storage', () => {
  const saved = {}
  saveHoldMusicMuted({ setItem: (key, value) => { saved[key] = value } }, true)
  assert.deepEqual(saved, { [HOLD_MUSIC_MUTED_KEY]: '1' })
  assert.doesNotThrow(() => saveHoldMusicMuted({ setItem: () => { throw new Error('full') } }, false))
})

test('createHoldMusic: starts silent on a loop, then fades in to the hold volume', async () => {
  const audio = fakeAudio()
  const { music, clock, audible } = holdMusicWith(audio)
  assert.equal(await music.start(), true)
  assert.equal(audio.loop, true)
  assert.equal(audio.volume, 0)
  assert.deepEqual(audible, [true])
  clock.advance(FADE_IN_MS / 2)
  assert.equal(audio.volume, HOLD_MUSIC_VOLUME / 2)
  clock.advance(FADE_IN_MS)
  assert.equal(audio.volume, HOLD_MUSIC_VOLUME)
})

test('createHoldMusic: fades out, then pauses', async () => {
  const audio = fakeAudio()
  const { music, clock, audible } = holdMusicWith(audio)
  await music.start()
  clock.advance(FADE_IN_MS)
  music.stop()
  assert.deepEqual(audible, [true, false])
  clock.advance(FADE_OUT_MS - 1)
  assert.equal(audio.paused, false)
  clock.advance(1)
  assert.equal(audio.volume, 0)
  assert.equal(audio.paused, true)
})

test('createHoldMusic: reports silence when the browser blocks playback', async () => {
  const audio = fakeAudio({ rejectPlay: true })
  const { music, audible } = holdMusicWith(audio)
  assert.equal(await music.start(), false)
  assert.deepEqual(audible, [false])
})

test('createHoldMusic: a stop before playback begins wins over the start', async () => {
  const audio = fakeAudio()
  const { music, clock, audible } = holdMusicWith(audio)
  const started = music.start()
  music.stop()
  assert.equal(await started, false)
  clock.advance(FADE_OUT_MS)
  assert.equal(audio.paused, true)
  assert.deepEqual(audible, [false])
})

test('createHoldMusic: does nothing on stop before any start', () => {
  const { music, audible } = holdMusicWith(fakeAudio())
  assert.doesNotThrow(() => music.stop())
  assert.deepEqual(audible, [])
})

test('createHoldMusic: pauses when stop runs while the browser is still starting playback', async () => {
  let resolvePlay
  const audio = fakeAudio()
  audio.play = function play() {
    return new Promise((resolve) => { resolvePlay = () => { this.paused = false; resolve() } })
  }
  const { music, audible } = holdMusicWith(audio)
  const started = music.start()
  music.stop()
  resolvePlay()
  assert.equal(await started, false)
  assert.equal(audio.paused, true)
  assert.equal(audio.volume, 0)
  assert.deepEqual(audible, [])
})

const fakeAudioContext = () => {
  const calls = []
  const gain = { gain: { value: 1 }, connect: (node) => node }
  const context = {
    destination: { name: 'speakers' },
    calls,
    gain,
    createGain: () => gain,
    createMediaElementSource: (audio) => {
      calls.push(['source', audio])
      return { connect: (node) => { calls.push(['connect', node]); return node } }
    },
    resume: () => { calls.push(['resume']); return Promise.resolve() },
  }
  return context
}

test('holdMusicVolume: fades through a gain node when Web Audio is available', async () => {
  const audio = fakeAudio()
  const context = fakeAudioContext()
  const volume = holdMusicVolume({ audio, getContext: () => context })
  assert.deepEqual(context.calls, [['source', audio], ['connect', context.gain]])
  volume.write(0.3)
  assert.equal(context.gain.gain.value, 0.3)
  assert.equal(volume.read(), 0.3)
  assert.equal(audio.volume, 1)
  await volume.resume()
  assert.deepEqual(context.calls.at(-1), ['resume'])
})

test('holdMusicVolume: falls back to the element volume without Web Audio', () => {
  const audio = fakeAudio()
  const volume = holdMusicVolume({ audio, getContext: () => null })
  volume.write(0.2)
  assert.equal(audio.volume, 0.2)
  assert.doesNotThrow(() => volume.resume())
})

test('createHoldMusic: routes the element through the volume control only once', async () => {
  const audio = fakeAudio()
  const clock = fakeClock()
  let made = 0
  const music = createHoldMusic({
    makeAudio: () => audio,
    makeVolume: (element) => { made += 1; return holdMusicVolume({ audio: element, getContext: () => null }) },
    onAudibleChange: () => {},
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: clock.now,
  })
  await music.start()
  music.stop()
  clock.advance(FADE_OUT_MS)
  await music.start()
  assert.equal(made, 1)
})

test('audioContextOnce: creates one context and reuses it', () => {
  let created = 0
  class FakeContext { constructor() { created += 1 } }
  const getContext = audioContextOnce({ AudioContext: FakeContext })
  assert.equal(getContext(), getContext())
  assert.equal(created, 1)
})

test('audioContextOnce: uses the prefixed constructor, and returns null without Web Audio', () => {
  class FakeContext {}
  assert.ok(audioContextOnce({ webkitAudioContext: FakeContext })() instanceof FakeContext)
  assert.equal(audioContextOnce({})(), null)
})
