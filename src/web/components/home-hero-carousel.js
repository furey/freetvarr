import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick } from '/vendor/vue.esm-browser.prod.js'
import { artFallbackStyle } from '/art-fallback.js'
import { live, playback } from '/shared/player-shared.js'
import {
  SLIDE_MS,
  rotationStart,
  nextRotation,
  isAdvancing,
  showsPauseButton,
  pauseButtonOf,
  fillFractionOf,
  wrapIndex,
} from '/hero-rotation.js'
import { adoptedOrderOf, sameKeySet } from '/hero-remix.js'
import { focusKeyOf } from '/image-focus.js'
import { HERO_SIZES } from '/home-hero.js'
import { overlayStack } from '/overlay-stack.js'
import {
  heroMotionOf,
  directionOf,
  changeKindOf,
  playSlideChange,
  settleSlide,
  startDrift,
  predecode,
} from '/hero-transition.js'

const SWIPE_GAP_PX = 12
const SWIPE_COMMIT_FRACTION = 0.2
const SWIPE_INTENT_PX = 8
const SETTLE_MS = 280
const DOT_KEY_STEPS = { ArrowRight: 1, ArrowLeft: -1 }
const PAUSE_ZONE_SELECTOR = '.hero-slide-actions, .hero-carousel-controls'
const TAP_IGNORE_SELECTOR = 'a, button, input, [role="button"], .hero-carousel-controls'
const knownFocus = new Map()

const fetchFocus = async (key) => {
  const res = await fetch(`/api/image-focus?k=${encodeURIComponent(key)}`).catch(() => null)
  const body = res?.ok ? await res.json().catch(() => null) : null
  return body?.items?.[key] ?? null
}

const focusOfImage = (image, { fresh = false } = {}) => {
  const key = focusKeyOf(image.currentSrc || image.src, location.origin)
  if (!key) return Promise.resolve(null)
  if (fresh || !knownFocus.has(key)) knownFocus.set(key, fetchFocus(key).then((focus) => forgetMissing({ key, focus })))
  return knownFocus.get(key)
}

const forgetMissing = ({ key, focus }) => {
  if (!focus) knownFocus.delete(key)
  return focus
}

const rememberSuppliedFocus = (slides) => {
  for (const slide of slides) {
    const key = slide.art.focus && focusKeyOf(slide.art.image, location.origin)
    if (key && !knownFocus.has(key)) knownFocus.set(key, Promise.resolve(slide.art.focus))
  }
}

export const HomeHeroCarousel = {
  props: {
    slides: { type: Array, required: true },
  },
  emits: ['action', 'menu'],
  template: `
    <section class="hero-carousel" aria-roledescription="carousel" aria-label="Highlights"
      :class="{ 'is-reduced': rotation.reducedMotion }"
      @pointerover="onPointerOver" @pointerleave="onPointerLeave" @focusin="onFocusIn" @focusout="onFocusOut">
      <div class="hero-carousel-viewport">
        <div ref="stage" class="hero-carousel-stage" :aria-live="advancing ? 'off' : 'polite'"
          @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
          <article v-for="(slide, i) in orderedSlides" :key="slide.key" :id="slideId(i)" role="group" aria-roledescription="slide"
            :aria-label="(i + 1) + ' of ' + orderedSlides.length" :aria-hidden="i === rotation.index ? null : 'true'"
            :inert="i !== rotation.index" :class="['ui-hero', 'hero-slide', { 'is-active': i === rotation.index, 'is-leaving': slide.key === leavingKey }]"
            :style="slideStyle(i)" :ref="(el) => setSlideRef(el, slide.key)">
            <div :class="['hero-slide-backdrop', { 'ui-art-fallback': failedArt[artKeyOf(slide)] }]"
              :style="failedArt[artKeyOf(slide)] ? fallbackStyleOf(slide) : null">
              <img v-if="!failedArt[artKeyOf(slide)]" class="ui-hero-art" :src="slide.art.image"
                :srcset="slide.art.srcset" :sizes="heroSizes" alt="" decoding="async"
                :fetchpriority="i === 0 ? 'high' : null" :loading="isNearActive(i) ? 'eager' : 'lazy'" @error="markArtFailed(slide)" />
            </div>
            <div class="ui-hero-scrim"></div>
            <div class="ui-hero-body hero-slide-body">
              <div :class="['ui-hero-kicker', 'hero-slide-eyebrow', { 'is-live': slide.badge }]">
                <span v-if="slide.badge" class="ui-live-badge"><span class="ui-live-dot"></span>{{ slide.badge }}</span>
                <template v-if="slide.eyebrowAccent"><span class="hero-slide-eyebrow-accent">{{ slide.eyebrowAccent }}</span><span class="hero-slide-eyebrow-dot" aria-hidden="true">·</span><span class="hero-slide-eyebrow-reason">{{ slide.eyebrow }}</span></template>
                <template v-else>{{ slide.eyebrow }}</template>
              </div>
              <h2 class="ui-hero-title hero-slide-title">{{ slide.title }}</h2>
              <div class="ui-hero-meta ui-only-wide">{{ slide.meta }}</div>
              <div class="ui-hero-meta ui-only-phone">{{ slide.metaShort }}</div>
              <div v-if="slide.progress" :class="['ui-progress', 'hero-slide-progress', { 'is-live': slide.progress.live }]"
                role="progressbar" :aria-label="slide.progress.label" :aria-valuenow="slide.progress.percent"
                aria-valuemin="0" aria-valuemax="100">
                <span class="ui-progress-fill" :style="{ width: slide.progress.percent + '%' }"></span>
              </div>
              <div class="ui-hero-actions hero-slide-actions">
                <button type="button" :class="['ui-button', 'ui-button-primary', { 'ui-button-record': slide.primary.icon === 'record' }]" @click="emitAction(slide, slide.primary)">
                  <play-icon v-if="slide.primary.icon === 'play'" />
                  <start-over-icon v-else-if="slide.primary.icon === 'start-over'" />
                  <span v-else-if="slide.primary.icon === 'record'" class="hero-slide-record-dot" aria-hidden="true"></span>
                  {{ slide.primary.label }}
                </button>
                <template v-if="slide.secondary">
                  <a v-if="slide.secondary.href" :href="slide.secondary.href" class="ui-button ui-button-secondary hero-slide-secondary">{{ slide.secondary.label }}</a>
                  <button v-else type="button" class="ui-button ui-button-secondary hero-slide-secondary" @click="emitAction(slide, slide.secondary)">{{ slide.secondary.label }}</button>
                </template>
                <button type="button" class="ui-button ui-button-secondary hero-slide-more" :aria-label="'More for ' + slide.title"
                  aria-haspopup="dialog" @click="$emit('menu', slide)"><more-glyph /></button>
              </div>
            </div>
          </article>
        </div>
      </div>
      <div v-if="orderedSlides.length > 1" class="hero-carousel-controls">
        <div class="hero-carousel-dots" role="tablist" aria-label="Choose a slide" @keydown="onDotKey">
          <button v-for="(slide, i) in orderedSlides" :key="slide.key" :ref="(el) => setDotRef(el, i)" type="button" role="tab"
            :class="['hero-carousel-dot', { 'is-on': i === rotation.index }]" :aria-selected="String(i === rotation.index)"
            :aria-controls="slideId(i)" :aria-label="'Slide ' + (i + 1) + ' of ' + orderedSlides.length"
            :tabindex="i === rotation.index ? 0 : -1" @click="goTo(i)">
            <i><em v-if="i === rotation.index" :ref="setFillRef"></em></i>
          </button>
        </div>
        <button v-if="pauseShown" type="button" class="hero-carousel-pause" :aria-label="pauseButton.label"
          @click="dispatch({ type: pauseButton.action })">
          <pause-icon v-if="pauseButton.action === 'pause'" />
          <play-icon v-else />
        </button>
      </div>
    </section>
  `,
  setup(props, { emit }) {
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let state = rotationStart({ count: props.slides.length, reducedMotion: reducedQuery.matches })
    watch(() => props.slides, rememberSuppliedFocus, { immediate: true })
    const displayKeys = ref(props.slides.map((slide) => slide.key))
    const keptSlides = shallowRef(null)
    const slidesByKey = computed(() => new Map([...(keptSlides.value ?? []), ...props.slides.map((slide) => [slide.key, slide])]))
    const orderedSlides = computed(() => displayKeys.value.map((key) => slidesByKey.value.get(key)).filter(Boolean))
    const rotation = shallowRef(state)
    const clockMs = ref(Date.now())
    const stage = ref(null)
    const failedArt = ref({})
    const drag = ref(null)
    const carouselId = `hero-${Math.random().toString(36).slice(2, 8)}`
    const dotEls = []
    let fillEl = null
    let frame = null
    let lastFrameAt = 0
    let pointerStart = null
    let pendingKeys = null
    let pendingChange = null
    let swipeCommitted = false
    let running = null
    let restoringFocus = false
    let stopOverlayWatch = null
    const slideEls = new Map()
    const drifts = new Map()
    const leavingKey = ref(null)
    const motionNow = () => heroMotionOf({ reducedMotion: state.reducedMotion })

    const dispatch = (event) => {
      const next = withPendingOrder(nextRotation(state, event))
      if (next === state) return
      if (next.index !== state.index) {
        pendingChange = { direction: directionOfEvent(event, state), kind: changeKindOf(event.type), animated: !swipeCommitted }
      }
      const onlyFillMoved = Object.keys(next).every((key) => key === 'elapsedMs' || next[key] === state[key])
      state = next
      if (!onlyFillMoved) rotation.value = next
    }

    const withPendingOrder = (next) => {
      if (!pendingKeys || next.index === state.index) return next
      const adopted = adoptedOrderOf({ pendingKeys, targetKey: displayKeys.value[next.index] })
      pendingKeys = null
      displayKeys.value = adopted.keys
      return { ...next, index: adopted.index }
    }

    const directionOfEvent = (event, before) => {
      if (event.type === 'step') return Math.sign(event.delta) || 1
      if (event.type === 'goTo') return directionOf({ from: before.index, to: event.index })
      return 1
    }

    const advancing = computed(() => isAdvancing(rotation.value, clockMs.value))
    const activeKey = computed(() => orderedSlides.value[rotation.value.index]?.key)

    const isNearActive = (i) => {
      const count = orderedSlides.value.length
      return i === rotation.value.index || i === wrapIndex({ index: rotation.value.index + 1, count })
    }

    const setSlideRef = (el, key) => {
      if (el) slideEls.set(key, el)
      else slideEls.delete(key)
    }

    const predecodeNext = () => {
      const count = orderedSlides.value.length
      const nextKey = orderedSlides.value[wrapIndex({ index: rotation.value.index + 1, count })]?.key
      predecode(slideEls.get(nextKey))
    }

    const cancelDriftsExcept = (keep) => {
      for (const [key, animation] of drifts) {
        if (keep.includes(key)) continue
        animation.cancel()
        drifts.delete(key)
      }
    }

    const syncDrifts = () => {
      for (const [key, animation] of drifts) {
        if (advancing.value && key === activeKey.value) animation.play()
        else animation.pause()
      }
    }

    const freezeDrift = (key) => drifts.get(key)?.pause()

    const beginDrift = async (key) => {
      const motion = motionNow()
      if (!motion.drift || !slideEls.get(key)) return
      const direction = rotation.value.index % 2 ? 1 : -1
      const animation = await startDrift({ slide: slideEls.get(key), durationMs: SLIDE_MS + motion.imageMs + 1_000, direction, focusOf: focusOfImage })
      if (!animation) return
      if (activeKey.value !== key) {
        animation.cancel()
        return
      }
      drifts.get(key)?.cancel()
      drifts.set(key, animation)
      syncDrifts()
    }

    const stopChange = () => {
      running?.cancel()
      running = null
      slideEls.forEach(settleSlide)
    }

    const settleRunningChange = () => {
      if (!running) return
      stopChange()
      leavingKey.value = null
      cancelDriftsExcept([activeKey.value])
      if (!drifts.has(activeKey.value)) beginDrift(activeKey.value)
    }

    const driftAfterFade = async ({ key, handle }) => {
      if (await handle.faded && activeKey.value === key) beginDrift(key)
    }

    const changeSlide = ({ key, previousKey, change }) => {
      stopChange()
      const incoming = slideEls.get(key)
      const outgoing = slideEls.get(previousKey)
      cancelDriftsExcept([previousKey])
      freezeDrift(previousKey)
      predecodeNext()
      if (!change?.animated || !incoming || !outgoing || key === previousKey) {
        leavingKey.value = null
        cancelDriftsExcept([key])
        beginDrift(key)
        return
      }
      leavingKey.value = previousKey
      const handle = playSlideChange({ incoming, outgoing, direction: change.direction, kind: change.kind, motion: motionNow() })
      running = handle
      if (change.kind === 'automatic') driftAfterFade({ key, handle })
      else beginDrift(key)
      handle.finished.then(() => {
        if (running !== handle) return
        running = null
        leavingKey.value = null
        cancelDriftsExcept([activeKey.value])
      })
    }
    const pauseShown = computed(() => showsPauseButton(rotation.value))
    const pauseButton = computed(() => pauseButtonOf(rotation.value, clockMs.value))

    const paintFill = () => {
      if (fillEl) fillEl.style.transform = `scaleX(${fillFractionOf(state)})`
    }

    const onFrame = (at) => {
      const dtMs = lastFrameAt ? at - lastFrameAt : 0
      lastFrameAt = at
      const nowMs = Date.now()
      if (Math.floor(nowMs / 500) !== Math.floor(clockMs.value / 500)) clockMs.value = nowMs
      if (!drag.value) dispatch({ type: 'tick', nowMs, dtMs })
      paintFill()
      frame = requestAnimationFrame(onFrame)
    }

    const startClock = () => {
      if (frame) return
      lastFrameAt = 0
      frame = requestAnimationFrame(onFrame)
    }

    const stopClock = () => {
      cancelAnimationFrame(frame)
      frame = null
    }

    const playerOpen = () => live.open || playback.open

    const syncClock = () => {
      if (document.hidden || playerOpen()) stopClock()
      else startClock()
    }

    const onVisibility = () => {
      dispatch({ type: 'hidden', hidden: document.hidden })
      syncClock()
    }

    const onReducedChange = () => dispatch({ type: 'reducedMotion', reduced: reducedQuery.matches })

    const holdSlides = () => {
      keptSlides.value = new Map(slidesByKey.value)
      dispatch({ type: 'overlayOpen', open: true })
    }

    const releaseSlides = () => {
      restoringFocus = true
      setTimeout(() => { restoringFocus = false })
      keptSlides.value = null
      dispatch({ type: 'overlayOpen', open: false })
      adoptKeys(slideKeysJoined())
    }

    const onOverlayChange = (size) => {
      if (size > 0 && !state.overlayOpen) holdSlides()
      else if (size === 0 && state.overlayOpen) releaseSlides()
    }

    onMounted(() => {
      document.addEventListener('visibilitychange', onVisibility)
      reducedQuery.addEventListener('change', onReducedChange)
      dispatch({ type: 'hidden', hidden: document.hidden })
      stopOverlayWatch = overlayStack.subscribe(onOverlayChange)
      onOverlayChange(overlayStack.size())
      syncClock()
      beginDrift(activeKey.value)
      predecodeNext()
    })

    onUnmounted(() => {
      document.removeEventListener('visibilitychange', onVisibility)
      reducedQuery.removeEventListener('change', onReducedChange)
      stopOverlayWatch?.()
      stopClock()
      stopChange()
      cancelDriftsExcept([])
    })

    watch(activeKey, (key, previousKey) => {
      const change = pendingChange
      pendingChange = null
      changeSlide({ key, previousKey, change })
    }, { flush: 'post' })

    watch(advancing, syncDrifts)

    watch(playerOpen, (open) => {
      dispatch({ type: 'playerOpen', open })
      syncClock()
    }, { immediate: true })

    const slideKeysJoined = () => props.slides.map((s) => s.key).join('|')

    const adoptKeys = (joined) => {
      if (state.overlayOpen) return
      const keys = joined ? joined.split('|') : []
      if (sameKeySet(keys, displayKeys.value)) {
        pendingKeys = joined === displayKeys.value.join('|') ? null : keys
        return
      }
      const currentKey = displayKeys.value[rotation.value.index]
      pendingKeys = null
      displayKeys.value = keys
      dispatch({ type: 'sync', count: keys.length, index: keys.indexOf(currentKey) })
    }

    watch(slideKeysJoined, adoptKeys)

    const setFillRef = (el) => {
      fillEl = el
      paintFill()
    }

    const setDotRef = (el, i) => { dotEls[i] = el }

    const slideId = (i) => `${carouselId}-slide-${i}`

    const goTo = (index) => dispatch({ type: 'goTo', index })

    const onDotKey = (e) => {
      const count = orderedSlides.value.length
      const target = {
        ...Object.fromEntries(Object.entries(DOT_KEY_STEPS).map(([key, delta]) => [key, rotation.value.index + delta])),
        Home: 0,
        End: count - 1,
      }[e.key]
      if (target == null) return
      e.preventDefault()
      goTo(target)
      nextTick(() => dotEls[rotation.value.index]?.focus())
    }

    const onPointerOver = (e) => {
      if (e.pointerType !== 'mouse') return
      dispatch({ type: e.target.closest?.(PAUSE_ZONE_SELECTOR) ? 'pointerEnter' : 'pointerLeave' })
    }
    const onPointerLeave = (e) => { if (e.pointerType === 'mouse') dispatch({ type: 'pointerLeave' }) }

    const onFocusIn = (e) => {
      if (restoringFocus || state.overlayOpen) return
      if (e.target.matches?.(':focus-visible')) dispatch({ type: 'keyboardFocus' })
    }

    const onFocusOut = (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) dispatch({ type: 'keyboardLeave' })
    }

    const stageWidth = () => stage.value?.offsetWidth || 1

    const onPointerDown = (e) => {
      if (e.pointerType !== 'touch') return
      dispatch({ type: 'touchStart' })
      if (orderedSlides.value.length < 2 || drag.value?.settling) return
      settleRunningChange()
      pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId, at: Date.now(), swiping: false, moved: false }
    }

    const onPointerMove = (e) => {
      if (!pointerStart || e.pointerId !== pointerStart.id) return
      const dx = e.clientX - pointerStart.x
      const dy = e.clientY - pointerStart.y
      if (Math.hypot(dx, dy) >= SWIPE_INTENT_PX) pointerStart.moved = true
      if (!pointerStart.swiping) {
        if (Math.abs(dx) < SWIPE_INTENT_PX || Math.abs(dx) < Math.abs(dy)) return
        pointerStart.swiping = true
        stage.value?.setPointerCapture?.(e.pointerId)
      }
      drag.value = { dx, settling: false }
    }

    const onPointerUp = (e) => {
      if (e.pointerType !== 'touch') return
      dispatch({ type: 'touchEnd' })
      const tapped = pointerStart && !pointerStart.moved && !e.target.closest?.(TAP_IGNORE_SELECTOR)
      const swiped = pointerStart?.swiping && drag.value
      pointerStart = null
      if (tapped && e.type === 'pointerup') togglePlaying()
      if (!swiped) return
      settleSwipe(drag.value.dx)
    }

    const togglePlaying = () => dispatch({ type: state.userPaused ? 'play' : 'pause' })

    const settleSwipe = (dx) => {
      const width = stageWidth()
      const commits = Math.abs(dx) > width * SWIPE_COMMIT_FRACTION
      const direction = dx < 0 ? 1 : -1
      const restingDx = commits ? -direction * (width + SWIPE_GAP_PX) : 0
      drag.value = { dx: restingDx, settling: true, direction: dx < 0 ? -1 : 1 }
      const settleMs = rotation.value.reducedMotion ? 0 : SETTLE_MS
      setTimeout(() => {
        swipeCommitted = true
        if (commits) dispatch({ type: 'step', delta: direction })
        swipeCommitted = false
        drag.value = null
      }, settleMs)
    }

    const neighbourIndex = () => {
      const { dx, direction } = drag.value
      const delta = (direction ?? (dx < 0 ? -1 : 1)) < 0 ? 1 : -1
      return wrapIndex({ index: rotation.value.index + delta, count: orderedSlides.value.length })
    }

    const slideStyle = (i) => {
      if (!drag.value) return null
      const { dx, settling } = drag.value
      const transition = settling && !rotation.value.reducedMotion ? `transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.2,1)` : 'none'
      if (i === rotation.value.index) return { transform: `translateX(${dx}px)`, transition, opacity: 1 }
      if (i !== neighbourIndex()) return null
      const offset = (dx < 0 || drag.value.direction === -1 ? 1 : -1) * (stageWidth() + SWIPE_GAP_PX)
      return { transform: `translateX(${dx + offset}px)`, transition, opacity: 1 }
    }

    const emitAction = (slide, button) => emit('action', { slide, action: button.action })
    const fallbackStyleOf = (slide) => artFallbackStyle(slide.art.title)
    const artKeyOf = (slide) => `${slide.key}|${slide.art.image}`
    const markArtFailed = (slide) => {
      failedArt.value = { ...failedArt.value, [artKeyOf(slide)]: true }
    }

    return {
      heroSizes: HERO_SIZES,
      rotation, stage, failedArt, leavingKey, isNearActive, setSlideRef, orderedSlides, advancing, pauseShown, pauseButton, dispatch, goTo, onDotKey,
      onPointerOver, onPointerLeave, onFocusIn, onFocusOut, onPointerDown, onPointerMove, onPointerUp, slideStyle, slideId,
      setFillRef, setDotRef, emitAction, fallbackStyleOf, artKeyOf, markArtFailed,
    }
  },
}
