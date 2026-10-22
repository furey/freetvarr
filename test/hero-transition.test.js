import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  HERO_MOTION, REDUCED_MOTION, DRIFT, heroMotionOf, directionOf, entranceDelaysOf, entranceSettleMsOf, coverScaleOf,
  canDrift, imageNudgeOf, changeKindOf, zoomOriginOf, positionPercentOf, playSlideChange, settleSlide,
} from '../src/web/hero-transition.js'

test('heroMotionOf: reduced motion gets the short fade, everything else the full change', () => {
  assert.equal(heroMotionOf({ reducedMotion: true }), REDUCED_MOTION)
  assert.equal(heroMotionOf({ reducedMotion: false }), HERO_MOTION)
})

test('the full change settles inside 650 ms and its picture inside 500 ms', () => {
  assert.ok(entranceSettleMsOf({ motion: HERO_MOTION, lineCount: 4 }) <= 650)
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

test('entranceDelaysOf: the text starts during the picture fade, the buttons start during the text fade', () => {
  const { text, actions } = entranceDelaysOf({ motion: HERO_MOTION, lineCount: 3 })
  assert.ok(text[0] > 0 && text[0] < HERO_MOTION.imageMs)
  assert.deepEqual(text, [text[0], text[0] + HERO_MOTION.textLineStaggerMs, text[0] + 2 * HERO_MOTION.textLineStaggerMs])
  assert.ok(actions > text[0] && actions < text[0] + HERO_MOTION.textInMs)
  assert.ok(HERO_MOTION.textLineStaggerMs <= 40)
  assert.deepEqual(entranceDelaysOf({ motion: REDUCED_MOTION, lineCount: 2 }), { text: [0, 0], actions: 0 })
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

const deferred = () => {
  const handlers = {}
  const promise = new Promise((resolve, reject) => Object.assign(handlers, { resolve, reject }))
  return { promise, ...handlers }
}

const fakeAnimation = () => {
  const done = deferred()
  done.promise.catch(() => null)
  const animation = {
    playState: 'running',
    plays: 0,
    finished: done.promise,
    pause: () => { animation.playState = 'paused' },
    play: () => {
      animation.plays += 1
      animation.playState = 'running'
    },
    cancel: () => {
      animation.playState = 'idle'
      done.reject(new Error('AbortError'))
    },
    finish: () => {
      animation.playState = 'finished'
      done.resolve(animation)
    },
  }
  return animation
}

const fakeElement = (className) => {
  const element = {
    className,
    animations: [],
    offsetWidth: 1000,
    animate: () => {
      const animation = fakeAnimation()
      element.animations.push(animation)
      return animation
    },
    getAnimations: () => element.animations.filter((animation) => animation.playState !== 'idle'),
    getClientRects: () => [{}],
    matches: (selector) => selector === `.${className}`,
  }
  return element
}

const fakeSlide = () => {
  const decoding = deferred()
  const image = { decode: () => decoding.promise }
  const backdrop = fakeElement('hero-slide-backdrop')
  const parts = ['hero-slide-eyebrow', 'hero-slide-title', 'ui-hero-meta', 'hero-slide-actions'].map(fakeElement)
  const slide = fakeElement('hero-slide')
  Object.assign(slide, {
    parts,
    decoded: () => decoding.resolve(),
    querySelector: (selector) => ({ '.hero-slide-backdrop': backdrop, '.ui-hero-art': image })[selector] ?? null,
    querySelectorAll: () => parts,
  })
  return slide
}

const changeOf = (incoming, outgoing) => playSlideChange({ incoming, outgoing, direction: 1, kind: 'manual', motion: HERO_MOTION })

const decodeBoth = async (...slides) => {
  slides.forEach((slide) => slide.decoded())
  await new Promise((resolve) => setImmediate(resolve))
}

test('playSlideChange: a change cancelled before its pictures decode never plays', async () => {
  const [incoming, outgoing] = [fakeSlide(), fakeSlide()]
  const change = changeOf(incoming, outgoing)
  change.cancel()
  await decodeBoth(incoming, outgoing)
  assert.equal(await change.started, false)
  assert.equal(await change.faded, false)
  await change.finished
  assert.ok(change.animations.every((animation) => animation.plays === 0 && animation.playState === 'idle'))
  assert.deepEqual(outgoing.parts.flatMap((part) => part.getAnimations()), [])
})

test('playSlideChange: back and forth before decode leaves only the newest change playing', async () => {
  const [first, second] = [fakeSlide(), fakeSlide()]
  const there = changeOf(second, first)
  there.cancel()
  const back = changeOf(first, second)
  await decodeBoth(first, second)
  assert.ok(there.animations.every((animation) => animation.plays === 0))
  assert.ok(back.animations.every((animation) => animation.plays === 1))
  const live = [first, second].flatMap((slide) => slide.parts.flatMap((part) => part.getAnimations()))
  assert.ok(live.every((animation) => back.animations.includes(animation)))
})

test('playSlideChange: a new change cancels animations an earlier change left on the same parts', () => {
  const [first, second] = [fakeSlide(), fakeSlide()]
  const stale = first.parts.map((part) => part.animate())
  changeOf(first, second)
  assert.ok(stale.every((animation) => animation.playState === 'idle'))
})

test('playSlideChange: a finished change hands every part back to its own style', async () => {
  const [incoming, outgoing] = [fakeSlide(), fakeSlide()]
  const change = changeOf(incoming, outgoing)
  await decodeBoth(incoming, outgoing)
  assert.equal(await change.started, true)
  change.animations.forEach((animation) => animation.finish())
  await change.finished
  assert.equal(change.isLive(), false)
  assert.deepEqual([incoming, outgoing].flatMap((slide) => slide.parts.flatMap((part) => part.getAnimations())), [])
})

test('settleSlide: cancels leftover part animations and ignores a missing slide', () => {
  const slide = fakeSlide()
  const part = slide.parts[0].animate()
  settleSlide(slide)
  settleSlide(null)
  assert.equal(part.playState, 'idle')
})

test('hero slides hide by opacity alone, so Chrome never leaves a stale inherited visibility on the title or buttons', async () => {
  const css = await fs.readFile(path.join(import.meta.dirname, '..', 'src', 'web', 'styles', 'home.css'), 'utf8')
  const slideRules = [...css.matchAll(/([^{}]*\.hero-slide(?:\.is-[a-z]+)?\s*(?:,[^{}]*)?)\{([^}]*)\}/g)]
    .filter(([, selector]) => /\.hero-slide(\.is-(active|leaving))?\s*(,|$)/m.test(selector.trim()))
  assert.ok(slideRules.length >= 2)
  for (const [, selector, body] of slideRules) assert.doesNotMatch(body, /visibility/, selector.trim())
  const carousel = await fs.readFile(path.join(import.meta.dirname, '..', 'src', 'web', 'components', 'home-hero-carousel.js'), 'utf8')
  assert.doesNotMatch(carousel, /visibility:/)
})
