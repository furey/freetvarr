import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import {
  isSettledRatings,
  lastLineRightOf,
  linkFitsLastLine,
  ratingsKeyOf,
  ratingsUrlOf,
  retryDelayOf,
  shownClassificationOf,
  shownReviewOf,
  shownScoreOf,
} from '/ratings-display.js'

export const useProgrammeRatings = (programme, { lateReviews = false } = {}) => {
  const ratings = shallowRef(null)
  const reviewAllowed = ref(false)
  const cardOpen = ref(false)
  const loading = ref(false)
  let token = 0
  let retryTimer = null
  let loadingTimer = null
  let openedAt = 0

  const stopLoading = () => {
    clearTimeout(loadingTimer)
    loadingTimer = null
    loading.value = false
  }

  const stop = () => {
    clearTimeout(retryTimer)
    retryTimer = null
    stopLoading()
    token += 1
  }

  const settle = (result) => {
    stopLoading()
    ratings.value = result
    reviewAllowed.value = lateReviews || Date.now() - openedAt <= REVIEW_INSERT_WINDOW_MS
  }

  const load = async ({ request, attempt }) => {
    const result = await api('GET', ratingsUrlOf(request)).catch(() => null)
    if (request.token !== token) return
    if (isSettledRatings(result)) {
      ratingsCache.set(request.key, result)
      return settle(result)
    }
    const delay = result?.status === 'pending' ? retryDelayOf(attempt) : null
    if (delay == null) return stopLoading()
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
    loadingTimer = setTimeout(() => { loading.value = true }, LOADING_DELAY_MS)
    load({ request: { key, title: program.title, kind: program.kind, year: program.year, token }, attempt: 0 })
  }

  watch(() => ratingsKeyOf(programme.value || {}), () => start(programme.value), { immediate: true })
  onUnmounted(stop)

  const score = computed(() => shownScoreOf(ratings.value))
  const review = computed(() => (reviewAllowed.value ? shownReviewOf(ratings.value) : null))
  const likely = computed(() => Boolean(programme.value?.ratingsLikely) || programme.value?.kind === 'movie')
  return { score, review, cardOpen, loading: computed(() => loading.value && likely.value) }
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
    <transition name="programme-score-loading">
      <span v-if="loading && !score" class="programme-art-badge programme-score-loading" role="status" aria-label="Loading rating">
        <i></i><i></i><i></i>
      </span>
    </transition>
    <div v-if="score" ref="scoreWrap" class="programme-score">
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
      @pointerenter="openOnHover" @pointerleave="closeAfterHover">
      <transition name="programme-score-card">
        <div v-if="classificationOpen" :id="classificationCardId" class="programme-score-card programme-classification-card" role="group"
          :aria-label="rated.ariaLabel">
          <p class="programme-score-card-title">{{ rated.adviceLine }}</p>
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

    const toggleScore = () => (scoreOpen.value ? closeCards() : showCard('score'))

    const toggleClassification = () => {
      if (openedByHover || !classificationOpen.value) return showCard('classification')
      closeCards()
    }

    const openOnHover = (event) => {
      if (event.pointerType !== 'mouse' || !hoverPointer() || classificationOpen.value) return
      showCard('classification')
      openedByHover = true
    }

    const closeAfterHover = (event) => {
      if (event.pointerType === 'mouse' && openedByHover && classificationOpen.value) closeCards()
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
    <figure :class="['programme-review', { 'is-inline': inline }]">
      <blockquote ref="quoteEl" class="programme-review-quote"><span ref="textEl">“{{ review.snippet }}”</span></blockquote>
      <a ref="linkEl" class="programme-review-link" :href="review.url" target="_blank" rel="noopener noreferrer">{{ review.linkLabel }}</a>
    </figure>
  `,
  setup(props) {
    const quoteEl = ref(null)
    const textEl = ref(null)
    const linkEl = ref(null)
    const inline = ref(false)
    let observer = null

    const lastLineRight = () => {
      const range = document.createRange()
      range.selectNodeContents(textEl.value)
      return lastLineRightOf(range.getClientRects())
    }

    const measure = () => {
      if (!quoteEl.value || !textEl.value || !linkEl.value) return
      const box = quoteEl.value.getBoundingClientRect()
      inline.value = linkFitsLastLine({
        lastLineRight: lastLineRight(),
        boxLeft: box.left,
        boxWidth: box.width,
        linkWidth: linkEl.value.getBoundingClientRect().width,
      })
    }

    onMounted(() => {
      measure()
      observer = new ResizeObserver(measure)
      observer.observe(quoteEl.value)
      document.fonts?.ready.then(measure)
    })
    onUnmounted(() => observer?.disconnect())
    watch(() => [props.review.snippet, props.review.linkLabel], () => nextTick(measure))

    return { quoteEl, textEl, linkEl, inline }
  },
}

const hoverPointer = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches === true

const ratingsCache = new Map()
let nextCardId = 1

const REVIEW_INSERT_WINDOW_MS = 2500
const LOADING_DELAY_MS = 300
