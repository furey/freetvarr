import { ref, computed, watch, nextTick, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { cardShiftOf, focusedPieceOf, pieceById, pieceStatuses, pillsOf, selectionFocusOf, sheetRevealOf, statusPartsOf } from '/system-diagram.js'
import { SystemDiagram } from '/components/system-diagram.js'
import { api, fetchServerAbout, fetchSettings, serverAbout } from '/shared/api.js'
import { useMediaQuery } from '/shared/composables.js'
import { healthSummary } from '/shared/health.js'
import { routeParams } from '/shared/router.js'
import { prefersReducedMotion } from '/shared/utils.js'

const PieceDetail = {
  props: {
    piece: { type: Object, required: true },
    status: { type: Object, default: null },
  },
  template: `
    <div class="sd-pills">
      <span v-for="pill in pills" :key="pill.text" :class="['sd-pill', { 'is-quiet': pill.quiet }]">{{ pill.text }}</span>
    </div>
    <p class="sd-detail-job">{{ piece.job }}</p>
    <p v-if="piece.more" class="sd-detail-more">{{ piece.more }}</p>
    <div v-if="status || piece.own" class="ui-group sd-detail-rows">
      <div v-if="status" class="ui-group-row sd-current">
        <span class="ui-group-row-main"><span class="ui-group-row-title">Current</span></span>
        <span :class="['ui-group-row-value', 'sd-current-value', { 'sd-mono': status.mono }]"><template v-for="(part, position) in statusParts" :key="position"><template v-if="position"> · </template><span class="sd-unbroken">{{ part }}</span></template></span>
      </div>
      <div v-if="piece.own" class="ui-group-row">
        <span class="ui-group-row-main">
          <span class="ui-group-row-title">Existing setup</span>
          <span class="ui-group-row-meta">{{ piece.own }}</span>
        </span>
      </div>
    </div>
  `,
  setup(props) {
    const pills = computed(() => pillsOf(props.piece))
    const statusParts = computed(() => statusPartsOf(props.status))
    return { pills, statusParts }
  },
}

export const SystemDiagramView = {
  components: { SystemDiagram, PieceDetail },
  template: `
    <div v-page-reveal ref="map" class="sd-map" :style="revealPadding ? { paddingBottom: revealPadding + 'px' } : null">
      <div class="sd-map-diagram">
        <system-diagram interactive :focus="focus" @select="toggle" />
      </div>
      <aside v-if="sideCard && piece" ref="card" :class="['sd-map-card', { 'is-placed': placed }]" :style="{ transform: shift }" aria-live="polite">
        <div class="sd-map-card-head">
          <h3 class="sd-map-card-title">{{ piece.title }}</h3>
          <button type="button" class="ui-icon-button" aria-label="Close" @click="closeCard"><close-glyph /></button>
        </div>
        <piece-detail :piece="piece" :status="status" />
        <div v-if="piece.links.length" class="sd-map-card-actions">
          <a v-for="link in piece.links" :key="link.href" class="ui-button ui-button-secondary ui-button-block" :href="link.href">Open {{ link.label }}</a>
        </div>
      </aside>
      <p v-else-if="sideCard" class="sd-map-card-empty">Select a component in the diagram.</p>
      <ui-sheet v-if="!sideCard" :open="sheetOpen" :title="piece ? piece.title : 'System diagram'" @close="closeSheet" @height="sheetHeight = $event">
        <template #header-actions>
          <button type="button" class="ui-icon-button" aria-label="Close" @click="closeSheet"><close-glyph /></button>
        </template>
        <piece-detail v-if="piece" :piece="piece" :status="status" />
        <template v-if="piece && piece.links.length" #footer>
          <a v-for="link in piece.links" :key="link.href" class="ui-button ui-button-secondary ui-button-block" :href="link.href">Open {{ link.label }}</a>
        </template>
      </ui-sheet>
    </div>
  `,
  setup() {
    const sideCard = useMediaQuery(SIDE_CARD_QUERY)
    const selected = ref('')
    const sheetOpen = ref(false)
    const map = ref(null)
    const card = ref(null)
    const placed = ref(false)
    const shift = ref('translateY(0)')
    let frame = 0
    const layoutWatcher = new ResizeObserver(() => schedulePlace())
    const settings = ref(null)
    const tuners = ref(null)
    const guide = ref(null)
    const piece = computed(() => pieceById(selected.value))
    const focus = computed(() => selectionFocusOf(selected.value))
    const statuses = computed(() => pieceStatuses({
      settings: settings.value,
      tvheadendState: healthSummary.value?.sources?.tvheadend ?? '',
      tuners: tuners.value,
      guide: guide.value,
      version: serverAbout.value?.version ?? '',
    }))
    const status = computed(() => statuses.value[selected.value] ?? null)

    const select = (id) => {
      selected.value = id
      sheetOpen.value = Boolean(id)
    }

    const toggle = (id) => {
      if (id === selected.value) return closeSheet()
      select(id)
    }

    const closeSheet = () => {
      sheetOpen.value = false
      selected.value = ''
    }

    const closeCard = () => {
      const id = selected.value
      closeSheet()
      nextTick(() => nodeOf({ map: map.value, id })?.focus())
    }

    const place = () => {
      frame = 0
      const node = nodeOf({ map: map.value, id: selected.value })
      if (!sideCard.value || !node || !card.value) return
      layoutWatcher.observe(card.value)
      const nodeBox = node.getBoundingClientRect()
      const mapTop = map.value.getBoundingClientRect().top
      const shiftPx = cardShiftOf({
        nodeCentre: nodeBox.top + nodeBox.height / 2,
        cardHeight: card.value.offsetHeight,
        naturalTop: mapTop + card.value.offsetTop,
        visibleTop: CARD_MARGIN,
        visibleBottom: window.innerHeight - CARD_MARGIN,
      })
      shift.value = `translateY(${shiftPx}px)`
    }

    const schedulePlace = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }

    const settleCard = async () => {
      placed.value = false
      await nextTick()
      place()
      if (prefersReducedMotion()) return
      requestAnimationFrame(() => requestAnimationFrame(() => { placed.value = true }))
    }

    const onKeydown = (event) => {
      if (event.key === 'Escape' && sideCard.value && selected.value) closeCard()
    }

    const sheetHeight = ref(0)
    const revealPadding = ref(0)
    let scrollBeforeSheet = null
    let paddingTimer = 0

    const scrollPage = (top) => window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })

    const revealAboveSheet = async () => {
      const node = nodeOf({ map: map.value, id: selected.value })
      if (!node) return
      clearTimeout(paddingTimer)
      scrollBeforeSheet ??= window.scrollY
      const box = node.getBoundingClientRect()
      const reveal = sheetRevealOf({
        nodeTop: box.top,
        nodeBottom: box.bottom,
        scrollY: window.scrollY,
        maxScroll: document.scrollingElement.scrollHeight - revealPadding.value - window.innerHeight,
        visibleTop: 0,
        sheetTop: window.innerHeight - sheetHeight.value,
        margin: REVEAL_MARGIN,
      })
      revealPadding.value = reveal.padding
      await nextTick()
      if (reveal.top !== window.scrollY) scrollPage(reveal.top)
    }

    const restoreScroll = () => {
      if (scrollBeforeSheet === null) return
      const top = scrollBeforeSheet
      scrollBeforeSheet = null
      scrollPage(top)
      clearTimeout(paddingTimer)
      dropPaddingAt(top)
    }

    const dropPaddingAt = (top) => {
      const startedAt = performance.now()
      const poll = () => {
        const arrived = Math.abs(window.scrollY - top) < 1
        if (arrived || performance.now() - startedAt > PADDING_HOLD_MAX_MS) {
          revealPadding.value = 0
          return
        }
        paddingTimer = setTimeout(poll, PADDING_POLL_MS)
      }
      poll()
    }

    watch([sheetHeight, selected], () => {
      if (sideCard.value) return
      if (sheetHeight.value > 0 && selected.value) revealAboveSheet()
      else if (!selected.value) restoreScroll()
    }, { flush: 'post' })

    watch([selected, sideCard], settleCard, { flush: 'post' })

    watch(() => focusedPieceOf(routeParams.value), (id) => {
      if (id) select(id)
    }, { immediate: true })

    onMounted(() => {
      fetchSettings().then((value) => { settings.value = value }, () => {})
      if (!serverAbout.value?.version) fetchServerAbout().catch(() => {})
      api('GET', '/api/live/tuner-status').then((value) => { tuners.value = value }, () => {})
      api('GET', '/api/tvh-guide/status').then((value) => { guide.value = value?.suggestion ?? null }, () => {})
    })

    onMounted(() => {
      if (selected.value) settleCard()
      window.addEventListener('scroll', schedulePlace, { passive: true })
      window.addEventListener('resize', schedulePlace)
      document.addEventListener('keydown', onKeydown)
      layoutWatcher.observe(document.body)
    })

    onUnmounted(() => {
      cancelAnimationFrame(frame)
      clearTimeout(paddingTimer)
      window.removeEventListener('scroll', schedulePlace)
      window.removeEventListener('resize', schedulePlace)
      document.removeEventListener('keydown', onKeydown)
      layoutWatcher.disconnect()
    })

    return { sideCard, sheetOpen, sheetHeight, revealPadding, piece, focus, status, map, card, placed, shift, select, toggle, closeSheet, closeCard }
  },
}

const SIDE_CARD_QUERY = '(min-width: 1100px) and (min-height: 501px)'

const CARD_MARGIN = 16

const REVEAL_MARGIN = 16

const PADDING_HOLD_MAX_MS = 2000

const PADDING_POLL_MS = 50

const nodeOf = ({ map, id }) => map?.querySelector(`.sd-node[data-piece="${id}"]`) ?? null
