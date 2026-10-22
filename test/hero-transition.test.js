import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HERO_MOTION, REDUCED_MOTION, DRIFT, heroMotionOf, directionOf, entranceDelaysOf, coverScaleOf,
  canDrift, imageNudgeOf, changeKindOf, zoomOriginOf, positionPercentOf,
} from '../src/web/hero-transition.js'

test('heroMotionOf: reduced motion gets the short fade, everything else the full change', () => {
  assert.equal(heroMotionOf({ reducedMotion: true }), REDUCED_MOTION)
  assert.equal(heroMotionOf({ reducedMotion: false }), HERO_MOTION)
})

test('the full change finishes its buttons inside 800 ms and its picture inside 500 ms', () => {
  const { actions } = entranceDelaysOf({ motion: HERO_MOTION })
  assert.ok(actions + HERO_MOTION.textInMs <= 800)
  assert.ok(HERO_MOTION.imageMs <= 500)
})

test('reduced motion is a short picture fade with no text motion, nudge, or drift', () => {
  assert.ok(REDUCED_MOTION.imageMs <= 200)
  assert.equal(REDUCED_MOTION.textInMs, 0)
  assert.equal(REDUCED_MOTION.drift, false)
  assert.equal(imageNudgeOf({ motion: REDUCED_MOTION, direction: 1, boxWidth: 1000 }), null)
})

test('directionOf: a lower target goes back, anything else goes forward', () => {
  assert.equal(directionOf({ from: 3, to: 1 }), -1)
  assert.equal(directionOf({ from: 1, to: 3 }), 1)
})

test('entranceDelaysOf: the text fades in as one group after the picture starts, then the buttons as a second group', () => {
  const { text, actions } = entranceDelaysOf({ motion: HERO_MOTION })
  assert.ok(text > 0)
  assert.ok(actions > text)
  assert.deepEqual(entranceDelaysOf({ motion: REDUCED_MOTION }), { text: 0, actions: 0 })
})

test('canDrift: a 768 px picture drifts on a 1440 px desktop hero, a 219 px guide picture does not', () => {
  const desktop = { boxWidth: 1272, boxHeight: 360 }
  assert.ok(canDrift({ naturalWidth: 768, naturalHeight: 432, ...desktop }))
  assert.equal(canDrift({ naturalWidth: 219, naturalHeight: 123, ...desktop }), false)
  assert.equal(coverScaleOf({ naturalWidth: 0, naturalHeight: 0, ...desktop }), Infinity)
  assert.ok(DRIFT.scale <= 1.04)
})

test('imageNudgeOf: the nudge comes from the travel side and never passes its overscan', () => {
  const nudge = imageNudgeOf({ motion: HERO_MOTION, direction: -1, boxWidth: 1000 })
  const px = Number(nudge.match(/translateX\((-?[\d.]+)px\)/)[1])
  assert.ok(px < 0)
  assert.ok(Math.abs(px) <= (1000 * (HERO_MOTION.imageNudgeScale - 1)) / 2)
})

test('changeKindOf: dots, arrow keys, and swipes are manual; the rotation clock and slide list updates are automatic', () => {
  for (const type of ['goTo', 'step']) assert.equal(changeKindOf(type), 'manual')
  for (const type of ['tick', 'sync']) assert.equal(changeKindOf(type), 'automatic')
})

test('imageNudgeOf: an automatic change is a plain crossfade with no sideways picture move', () => {
  assert.equal(imageNudgeOf({ motion: HERO_MOTION, direction: 1, boxWidth: 1000, kind: 'automatic' }), null)
  assert.match(imageNudgeOf({ motion: HERO_MOTION, direction: 1, boxWidth: 1000, kind: 'manual' }), /translateX/)
})

const boxAfterZoom = ({ natural, view, focus, position, zoom }) => {
  const scale = Math.max(view.width / natural.width, view.height / natural.height)
  const [ox, oy] = zoomOriginOf({ natural, view, focus, position, zoom }).split(' ').map((v) => (parseFloat(v) / 100))
  const axis = (size, length, placed, origin, [a, b]) => [a, b].map((fraction) => {
    const at = fraction * size - (size - length) * (placed / 100)
    return origin * length + zoom * (at - origin * length)
  })
  return {
    x: axis(natural.width * scale, view.width, position.x, ox, [focus.box[0], focus.box[2]]),
    y: axis(natural.height * scale, view.height, position.y, oy, [focus.box[1], focus.box[3]]),
  }
}

test('zoomOriginOf: three faces that fit stay inside the hero for the whole drift zoom', () => {
  const natural = { width: 1280, height: 720 }
  const focus = { x: 0.5, y: 0.35, box: [0.12, 0.2, 0.9, 0.55] }
  for (const view of [{ width: 1856, height: 360 }, { width: 1272, height: 360 }, { width: 358, height: 448 }]) {
    const position = { x: 50, y: 30 }
    const scale = Math.max(view.width / natural.width, view.height / natural.height)
    const fitsX = (focus.box[2] - focus.box[0]) * natural.width * scale <= view.width
    const { x, y } = boxAfterZoom({ natural, view, focus, position, zoom: DRIFT.scale })
    if (fitsX) assert.ok(x[0] >= -0.01 && x[1] <= view.width + 0.01, `${view.width}: ${x}`)
    assert.ok(Number.isFinite(y[0]))
  }
})

test('zoomOriginOf: a face against the left edge pins the zoom to that edge', () => {
  const natural = { width: 1280, height: 720 }
  const view = { width: 1272, height: 360 }
  const focus = { x: 0.05, y: 0.4, box: [0, 0.3, 0.1, 0.6] }
  const origin = zoomOriginOf({ natural, view, focus, position: { x: 0, y: 40 } })
  assert.equal(origin.split(' ')[0], '0%')
})

test('zoomOriginOf: no focus keeps the default origin', () => {
  assert.equal(zoomOriginOf({ natural: { width: 1, height: 1 }, view: { width: 1, height: 1 }, focus: null, position: { x: 50, y: 50 } }), null)
})

test('positionPercentOf reads percentages, keywords, and pixel offsets', () => {
  assert.deepEqual(positionPercentOf({ objectPosition: '30% 70%', overflow: { x: 100, y: 100 } }), { x: 30, y: 70 })
  assert.deepEqual(positionPercentOf({ objectPosition: 'center top', overflow: { x: 100, y: 100 } }), { x: 50, y: 0 })
  assert.deepEqual(positionPercentOf({ objectPosition: '-25px 0px', overflow: { x: 100, y: 0 } }), { x: 25, y: 50 })
})
