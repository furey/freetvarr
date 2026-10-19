import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick } from '/vendor/vue.esm-browser.prod.js'
import { artFallbackStyle } from '/art-fallback.js'
import { live, playback } from '/shared/player-shared.js'
import {
  rotationStart,
  nextRotation,
  isAdvancing,
  showsPauseButton,
  pauseButtonOf,
  fillFractionOf,
  wrapIndex,
} from '/hero-rotation.js'

const SWIPE_GAP_PX = 12
const SWIPE_COMMIT_FRACTION = 0.2
const SWIPE_INTENT_PX = 8
const SETTLE_MS = 280
const DOT_KEY_STEPS = { ArrowRight: 1, ArrowLeft: -1 }

export const HomeHeroCarousel = {
  props: {
    slides: { type: Array, required: true },
  },
  emits: ['action'],
  template: `
    <section class="hero-carousel" aria-roledescription="carousel" aria-label="Highlights"
      :class="{ 'is-reduced': rotation.reducedMotion, 'is-instant': instant }"
      @pointerenter="onPointerEnter" @pointerleave="onPointerLeave" @focusin="onFocusIn">
      <div class="hero-carousel-viewport">
        <div ref="stage" class="hero-carousel-stage" :aria-live="advancing ? 'off' : 'polite'"
          @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
          <article v-for="(slide, i) in slides" :key="slide.key" :id="slideId(i)" role="group" aria-roledescription="slide"
            :aria-label="(i + 1) + ' of ' + slides.length" :aria-hidden="i === rotation.index ? null : 'true'"
            :inert="i !== rotation.index" :class="['ui-hero', 'hero-slide', { 'is-active': i === rotation.index }]"
            :style="slideStyle(i)">
            <div class="hero-slide-backdrop ui-art-fallback" :style="fallbackStyleOf(slide)">
              <img v-if="!failedArt[slide.key]" class="ui-hero-art" :src="slide.art.image" alt="" decoding="async"
                :loading="i === rotation.index ? 'eager' : 'lazy'" @error="markArtFailed(slide)" />
            </div>
            <div class="ui-hero-scrim"></div>
            <div class="ui-hero-body hero-slide-body">
              <div :class="['ui-hero-kicker', 'hero-slide-eyebrow', { 'is-live': slide.badge }]">
                <span v-if="slide.badge" class="ui-live-badge"><span class="ui-live-dot"></span>{{ slide.badge }}</span>
                {{ slide.eyebrow }}
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
                <button type="button" class="ui-button ui-button-primary" @click="emitAction(slide, slide.primary)">
                  <play-icon v-if="slide.primary.icon === 'play'" />
                  <start-over-icon v-else-if="slide.primary.icon === 'start-over'" />
                  {{ slide.primary.label }}
                </button>
                <template v-if="slide.secondary">
                  <a v-if="slide.secondary.href" :href="slide.secondary.href" class="ui-button ui-button-secondary">{{ slide.secondary.label }}</a>
                  <button v-else type="button" class="ui-button ui-button-secondary" @click="emitAction(slide, slide.secondary)">{{ slide.secondary.label }}</button>
                </template>
              </div>
            </div>
          </article>
        </div>
      </div>
      <div v-if="slides.length > 1" class="hero-carousel-controls">
        <div class="hero-carousel-dots" role="tablist" aria-label="Choose a slide" @keydown="onDotKey">
          <button v-for="(slide, i) in slides" :key="slide.key" :ref="(el) => setDotRef(el, i)" type="button" role="tab"
            :class="['hero-carousel-dot', { 'is-on': i === rotation.index }]" :aria-selected="String(i === rotation.index)"
            :aria-controls="slideId(i)" :aria-label="'Slide ' + (i + 1) + ' of ' + slides.length"
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
    const rotation = shallowRef(state)
    const clockMs = ref(Date.now())
    const stage = ref(null)
    const failedArt = ref({})
    const drag = ref(null)
    const instant = ref(false)
    const carouselId = `hero-${Math.random().toString(36).slice(2, 8)}`
    const dotEls = []
    let fillEl = null
    let frame = null
    let lastFrameAt = 0
    let pointerStart = null

    const dispatch = (event) => {
      const next = nextRotation(state, event)
      if (next === state) return
      const onlyFillMoved = Object.keys(next).every((key) => key === 'elapsedMs' || next[key] === state[key])
      state = next
      if (!onlyFillMoved) rotation.value = next
    }

    const advancing = computed(() => isAdvancing(rotation.value, clockMs.value))
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

    const onVisibility = () => {
      dispatch({ type: 'hidden', hidden: document.hidden })
      if (document.hidden) stopClock()
      else startClock()
    }

    const onReducedChange = () => dispatch({ type: 'reducedMotion', reduced: reducedQuery.matches })

    onMounted(() => {
      document.addEventListener('visibilitychange', onVisibility)
      reducedQuery.addEventListener('change', onReducedChange)
      dispatch({ type: 'hidden', hidden: document.hidden })
      if (!document.hidden) startClock()
    })

    onUnmounted(() => {
      document.removeEventListener('visibilitychange', onVisibility)
      reducedQuery.removeEventListener('change', onReducedChange)
      stopClock()
    })

    watch(() => live.open || playback.open, (open) => dispatch({ type: 'playerOpen', open }), { immediate: true })

    watch(() => props.slides.map((s) => s.key).join('|'), (keys, previousKeys) => {
      const currentKey = (previousKeys ?? '').split('|')[rotation.value.index]
      dispatch({ type: 'sync', count: props.slides.length, index: keys.split('|').indexOf(currentKey) })
    })

    const setFillRef = (el) => {
      fillEl = el
      paintFill()
    }

    const setDotRef = (el, i) => { dotEls[i] = el }

    const slideId = (i) => `${carouselId}-slide-${i}`

    const goTo = (index) => dispatch({ type: 'goTo', index })

    const onDotKey = (e) => {
      const count = props.slides.length
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

    const onPointerEnter = (e) => { if (e.pointerType === 'mouse') dispatch({ type: 'pointerEnter' }) }
    const onPointerLeave = (e) => { if (e.pointerType === 'mouse') dispatch({ type: 'pointerLeave' }) }

    const onFocusIn = (e) => {
      if (e.target.matches?.(':focus-visible')) dispatch({ type: 'keyboardFocus' })
    }

    const stageWidth = () => stage.value?.offsetWidth || 1

    const onPointerDown = (e) => {
      if (e.pointerType !== 'touch') return
      dispatch({ type: 'touchStart' })
      if (props.slides.length < 2 || drag.value?.settling) return
      pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId, swiping: false }
    }

    const onPointerMove = (e) => {
      if (!pointerStart || e.pointerId !== pointerStart.id) return
      const dx = e.clientX - pointerStart.x
      const dy = e.clientY - pointerStart.y
      if (!pointerStart.swiping) {
        if (Math.abs(dx) < SWIPE_INTENT_PX || Math.abs(dx) < Math.abs(dy)) return
        pointerStart.swiping = true
        stage.value?.setPointerCapture?.(e.pointerId)
      }
      drag.value = { dx, settling: false }
    }

    const onPointerUp = (e) => {
      if (e.pointerType !== 'touch') return
      dispatch({ type: 'touchEnd', nowMs: Date.now() })
      const swiped = pointerStart?.swiping && drag.value
      pointerStart = null
      if (!swiped) return
      settleSwipe(drag.value.dx)
    }

    const settleSwipe = (dx) => {
      const width = stageWidth()
      const commits = Math.abs(dx) > width * SWIPE_COMMIT_FRACTION
      const direction = dx < 0 ? 1 : -1
      const restingDx = commits ? -direction * (width + SWIPE_GAP_PX) : 0
      drag.value = { dx: restingDx, settling: true, direction: dx < 0 ? -1 : 1 }
      const settleMs = rotation.value.reducedMotion ? 0 : SETTLE_MS
      setTimeout(() => {
        instant.value = true
        if (commits) dispatch({ type: 'step', delta: direction })
        drag.value = null
        requestAnimationFrame(() => requestAnimationFrame(() => { instant.value = false }))
      }, settleMs)
    }

    const neighbourIndex = () => {
      const { dx, direction } = drag.value
      const delta = (direction ?? (dx < 0 ? -1 : 1)) < 0 ? 1 : -1
      return wrapIndex({ index: rotation.value.index + delta, count: props.slides.length })
    }

    const slideStyle = (i) => {
      if (!drag.value) return null
      const { dx, settling } = drag.value
      const transition = settling && !rotation.value.reducedMotion ? `transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.2,1)` : 'none'
      if (i === rotation.value.index) return { transform: `translateX(${dx}px)`, transition, opacity: 1 }
      if (i !== neighbourIndex()) return null
      const offset = (dx < 0 || drag.value.direction === -1 ? 1 : -1) * (stageWidth() + SWIPE_GAP_PX)
      return { transform: `translateX(${dx + offset}px)`, transition, opacity: 1, visibility: 'visible' }
    }

    const emitAction = (slide, button) => emit('action', { slide, action: button.action })
    const fallbackStyleOf = (slide) => artFallbackStyle(slide.art.title)
    const markArtFailed = (slide) => { failedArt.value = { ...failedArt.value, [slide.key]: true } }

    return {
      rotation, stage, failedArt, instant, advancing, pauseShown, pauseButton, dispatch, goTo, onDotKey,
      onPointerEnter, onPointerLeave, onFocusIn, onPointerDown, onPointerMove, onPointerUp, slideStyle, slideId,
      setFillRef, setDotRef, emitAction, fallbackStyleOf, markArtFailed,
    }
  },
}
