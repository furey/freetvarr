import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INTRO_DAY_KEY,
  INTRO_SESSION_KEY,
  localDay,
  shouldPlayIntro,
  readIntroMemory,
  rememberIntroPlayed,
  introGeometry,
  introGeometryInEm,
  flightTransform,
} from '../src/web/brand-intro.js'

const fakeStorage = (entries = {}) => {
  const values = new Map(Object.entries(entries))
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  }
}

const throwingStorage = () => {
  throw new Error('SecurityError')
}

const fresh = { reducedMotion: false, hidden: false, playedThisSession: false, lastPlayedOn: null, today: '2026-10-19' }

test('localDay: formats the local calendar day', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
})

test('shouldPlayIntro: plays on the first load of a session', () => {
  assert.equal(shouldPlayIntro({ ...fresh, lastPlayedOn: '2026-10-19' }), true)
})

test('shouldPlayIntro: plays on the first load of a new day in the same session', () => {
  assert.equal(shouldPlayIntro({ ...fresh, playedThisSession: true, lastPlayedOn: '2026-10-18' }), true)
})

test('shouldPlayIntro: stays quiet after it played this session and today', () => {
  assert.equal(shouldPlayIntro({ ...fresh, playedThisSession: true, lastPlayedOn: '2026-10-19' }), false)
})

test('shouldPlayIntro: never plays under reduced motion', () => {
  assert.equal(shouldPlayIntro({ ...fresh, reducedMotion: true }), false)
})

test('shouldPlayIntro: never plays in a hidden tab', () => {
  assert.equal(shouldPlayIntro({ ...fresh, hidden: true }), false)
})

test('readIntroMemory: reads both stores', () => {
  const local = fakeStorage({ [INTRO_DAY_KEY]: '2026-10-18' })
  const session = fakeStorage({ [INTRO_SESSION_KEY]: '1' })
  assert.deepEqual(readIntroMemory({ local: () => local, session: () => session }),
    { playedThisSession: true, lastPlayedOn: '2026-10-18' })
})

test('readIntroMemory: treats blocked storage as empty', () => {
  assert.deepEqual(readIntroMemory({ local: throwingStorage, session: () => null }),
    { playedThisSession: false, lastPlayedOn: null })
})

test('rememberIntroPlayed: writes the day and the session flag', () => {
  const local = fakeStorage()
  const session = fakeStorage()
  rememberIntroPlayed({ local: () => local, session: () => session, today: '2026-10-19' })
  assert.equal(local.values.get(INTRO_DAY_KEY), '2026-10-19')
  assert.equal(session.values.get(INTRO_SESSION_KEY), '1')
})

test('rememberIntroPlayed: survives blocked storage', () => {
  assert.doesNotThrow(() => rememberIntroPlayed({ local: throwingStorage, session: throwingStorage, today: '2026-10-19' }))
})

test('introGeometry: matches the mockup at 84 px', () => {
  const ink = { cap: 60, fontAscent: 80, fontHeight: 100 }
  const segments = [{ left: 0, width: 180 }, { left: 180, width: 80 }, { left: 260, width: 120 }]
  const { clipHeight, chips } = introGeometry({ fontSize: 84, ink, wordWidth: 380, segments })
  assert.equal(clipHeight, 75)
  assert.equal(chips[0].width, 48)
  assert.equal(chips[0].left, 66)
  assert.equal(chips[1].dx, -30)
  assert.equal(chips[2].delayMs, 80)
  assert.equal(chips[0].sy, 6 / 36)
  assert.equal(chips[0].dy, (72 - 30) - (75 + 2 + 3))
})

test('introGeometry: scales chips with the font size', () => {
  const ink = { cap: 30, fontAscent: 40, fontHeight: 50 }
  const { chips } = introGeometry({ fontSize: 42, ink, wordWidth: 190, segments: [{ left: 0, width: 90 }] })
  assert.equal(chips[0].width, 24)
  assert.equal(chips[0].bob, 7)
})

test('introGeometryInEm: sizes the clip from the font, not from a measurement', () => {
  const { clipHeight } = introGeometryInEm({ fontSize: 58.5, wordWidth: 0, segments: [] })
  assert.equal(clipHeight, 0.85 + 3 / 84)
})

test('introGeometryInEm: gives the same em geometry at any font size', () => {
  const at = (fontSize) => introGeometryInEm({
    fontSize,
    wordWidth: 4 * fontSize,
    segments: [{ left: 0, width: 2 * fontSize }, { left: 2 * fontSize, width: fontSize }],
  })
  assert.deepEqual(at(44), at(84))
})

test('flightTransform: moves the top-left corner and scales by width', () => {
  assert.deepEqual(
    flightTransform({ from: { left: 100, top: 300, width: 400 }, to: { left: 20, top: 40, width: 100 } }),
    { x: -80, y: -260, scale: 0.25 },
  )
})
