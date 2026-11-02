import { computed, onUnmounted, ref, shallowRef, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import {
  hoverClosesCard,
  hoverOpensCard,
  isSettledRatings,
  pressKeepsCardOpen,
  ratingsKeyOf,
  ratingsUrlOf,
  retryDelayOf,
  shownClassificationOf,
  shownReviewOf,
  shownScoreOf,
} from '/ratings-display.js'
import { expiringMap } from '/bounded-cache.js'
import { remainingHoldMs } from '/pending.js'

export const useProgrammeRatings = (programme, { lateReviews = false } = {}) => {
  const ratings = shallowRef(null)
  const reviewAllowed = ref(false)
  const cardOpen = ref(false)
  const loading = ref(false)
  const likely = computed(() => Boolean(programme.value?.ratingsLikely) || programme.value?.kind === 'movie')
  const dotsShown = computed(() => loading.value && likely.value)
  let token = 0
  let retryTimer = null
  let loadingTimer = null
  let dotsHoldTimer = null
  let dotsShownAt = 0
  let openedAt = 0

  const showDots = () => {
    dotsShownAt = Date.now()
    loading.value = true
  }

  const stopLoading = () => {
    clearTimeout(loadingTimer)
    clearTimeout(dotsHoldTimer)
    loadingTimer = null
    dotsHoldTimer = null
    loading.value = false
  }

  const afterDotsHold = (finish) => {
    clearTimeout(loadingTimer)
    loadingTimer = null
    const holdMs = dotsShown.value ? remainingHoldMs({ startedAt: dotsShownAt, now: Date.now(), minMs: DOTS_MIN_MS }) : 0
    if (!holdMs) return finish()
    dotsHoldTimer = setTimeout(finish, holdMs)
  }

  const stop = () => {
    clearTimeout(retryTimer)
    retryTimer = null
    stopLoading()
    token += 1
  }

  const settle = (result) => {
    const allowReview = lateReviews || Date.now() - openedAt <= REVIEW_INSERT_WINDOW_MS
    afterDotsHold(() => {
      stopLoading()
      ratings.value = result
      reviewAllowed.value = allowReview
    })
  }

  const load = async ({ request, attempt }) => {
    const result = await api('GET', ratingsUrlOf(request)).catch(() => null)
    if (request.token !== token) return
    if (isSettledRatings(result)) {
      ratingsCache.set(request.key, result)
      return settle(result)
    }
    const delay = result?.status === 'pending' ? retryDelayOf(attempt) : null
    if (delay == null) return afterDotsHold(stopLoading)
    retryTimer = setTimeout(() => load({ request, attempt: attempt + 1 }), delay)
  }

  const start = (program) => {
    stop()
    ratings.value = null
    reviewAllowed.value = false
    cardOpen.value = false
    const key = ratingsKeyOf(program || {})
    if (!key) return
    openedAt = Date.now()
    const cached = ratingsCache.get(key)
    if (cached) return settle(cached)
    loadingTimer = setTimeout(showDots, LOADING_DELAY_MS)
    load({ request: { key, title: program.title, kind: program.kind, year: program.year, token }, attempt: 0 })
  }

  watch(() => ratingsKeyOf(programme.value || {}), () => start(programme.value), { immediate: true })
  onUnmounted(stop)

  const score = computed(() => shownScoreOf(ratings.value))
  const review = computed(() => (reviewAllowed.value ? shownReviewOf(ratings.value) : null))
  return { score, review, cardOpen, loading: dotsShown }
}

export const ProgrammeArtBadges = {
  props: {
    classification: { type: String, default: null },
    advice: { type: Array, default: () => [] },
    score: { type: Object, default: null },
    open: Boolean,
    loading: Boolean,
  },
  emits: ['update:open'],
  template: `
    <transition name="programme-score-loading" :css="!score">
      <span v-if="loading && !score" class="programme-art-badge programme-score-loading ui-loading-dots" role="status" aria-label="Loading rating">
        <i></i><i></i><i></i>
      </span>
    </transition>
    <div v-if="score" ref="scoreWrap" class="programme-score"
      @pointerenter="openOnHover('score', $event)" @pointerleave="closeAfterHover('score', $event)">
      <transition name="programme-score-card">
        <div v-if="scoreOpen" :id="cardId" class="programme-score-card" role="group" :aria-label="score.ariaLabel">
          <p class="programme-score-card-title">{{ score.outOf }}</p>
          <p class="programme-score-card-meta">{{ score.votesLine }}</p>
          <a v-if="score.url" class="programme-score-card-link" :href="score.url" target="_blank" rel="noopener noreferrer">{{ score.linkLabel }}</a>
        </div>
      </transition>
      <button ref="scoreButton" type="button" class="programme-art-badge programme-score-badge" :aria-label="score.ariaLabel"
        :aria-expanded="String(scoreOpen)" :aria-controls="cardId" @click="toggleScore">
        <svg class="programme-score-star" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1.25l2.03 4.3 4.72.58-3.47 3.25.9 4.67L8 11.75l-4.18 2.3.9-4.67L1.25 6.13l4.72-.58z"/>
        </svg>
        <span aria-hidden="true">{{ score.label }}</span>
      </button>
    </div>
    <div v-if="rated?.adviceLine" ref="classificationWrap" class="programme-classification-wrap"
      @pointerenter="openOnHover('classification', $event)" @pointerleave="closeAfterHover('classification', $event)">
      <transition name="programme-score-card">
        <div v-if="classificationOpen" :id="classificationCardId" class="programme-score-card programme-classification-card" role="group"
          :aria-label="rated.ariaLabel">
          <p class="programme-score-card-meta">{{ rated.adviceLine }}</p>
        </div>
      </transition>
      <button ref="classificationButton" type="button" :class="['programme-art-badge', 'programme-classification', 'programme-classification-badge', 'is-' + rated.tone]"
        :aria-label="rated.ariaLabel" :aria-expanded="String(classificationOpen)" :aria-controls="classificationCardId"
        @click="toggleClassification">{{ rated.code }}</button>
    </div>
    <span v-else-if="rated" :class="['programme-art-badge', 'programme-classification', 'is-' + rated.tone]" role="img"
      :aria-label="rated.ariaLabel">{{ rated.code }}</span>
  `,
  setup(props, { emit }) {
    const scoreWrap = ref(null)
    const scoreButton = ref(null)
    const classificationWrap = ref(null)
    const classificationButton = ref(null)
    const openCard = ref('score')
    const cardId = `programme-score-card-${nextCardId++}`
    const classificationCardId = `programme-classification-card-${nextCardId++}`
    const rated = computed(() => shownClassificationOf({ classification: props.classification, advice: props.advice }))
    const scoreOpen = computed(() => props.open && openCard.value === 'score')
    const classificationOpen = computed(() => props.open && openCard.value === 'classification')
    let openedByHover = false

    const showCard = (card) => {
      openedByHover = false
      openCard.value = card
      emit('update:open', true)
    }

    const closeCards = () => {
      openedByHover = false
      emit('update:open', false)
    }

    const isCardOpen = (card) => (card === 'score' ? scoreOpen.value : classificationOpen.value)

    const toggleCard = (card) => {
      if (pressKeepsCardOpen({ openedByHover, open: isCardOpen(card) })) return showCard(card)
      closeCards()
    }

    const toggleScore = () => toggleCard('score')

    const toggleClassification = () => toggleCard('classification')

    const openOnHover = (card, event) => {
      if (!hoverOpensCard({ pointerType: event.pointerType, hoverPointer: hoverPointer(), open: isCardOpen(card) })) return
      showCard(card)
      openedByHover = true
    }

    const closeAfterHover = (card, event) => {
      if (hoverClosesCard({ pointerType: event.pointerType, openedByHover, open: isCardOpen(card) })) closeCards()
    }

    const openWrap = () => (openCard.value === 'score' ? scoreWrap.value : classificationWrap.value)

    const closeOnOutsidePress = (event) => {
      if (!openWrap()?.contains(event.target)) closeCards()
    }

    const listenOutside = (open) => {
      document.removeEventListener('pointerdown', closeOnOutsidePress, true)
      if (open) document.addEventListener('pointerdown', closeOnOutsidePress, true)
    }

    const refocusButtonIfInside = () => {
      const button = openCard.value === 'score' ? scoreButton.value : classificationButton.value
      if (openWrap()?.contains(document.activeElement)) button?.focus()
    }

    watch(() => props.open, (open) => {
      listenOutside(open)
      if (!open) refocusButtonIfInside()
    }, { immediate: true })
    onUnmounted(() => listenOutside(false))

    return {
      scoreWrap,
      scoreButton,
      classificationWrap,
      classificationButton,
      cardId,
      classificationCardId,
      rated,
      scoreOpen,
      classificationOpen,
      toggleScore,
      toggleClassification,
      openOnHover,
      closeAfterHover,
    }
  },
}

export const ProgrammeReviewCard = {
  props: {
    review: { type: Object, required: true },
  },
  template: `
    <figure class="programme-review">
      <blockquote class="programme-review-quote">“{{ review.snippet }}”</blockquote>
      <a class="programme-review-link" :href="review.url" target="_blank" rel="noopener noreferrer">{{ review.linkLabel }}</a>
    </figure>
  `,
}

const hoverPointer = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches === true

const LOOKUP_ANSWER_TTL_MS = 5 * 60_000
const ratingsCache = expiringMap({ limit: 500, ttlMs: LOOKUP_ANSWER_TTL_MS })
let nextCardId = 1

const REVIEW_INSERT_WINDOW_MS = 2500
const LOADING_DELAY_MS = 300
const DOTS_MIN_MS = 600
