import { ref, computed, watch, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { focusedPieceOf, pieceById, pieceStatuses, pillsOf, selectionFocusOf, statusPartsOf } from '/system-diagram.js'
import { SystemDiagram } from '/components/system-diagram.js'
import { api, fetchServerAbout, fetchSettings, serverAbout } from '/shared/api.js'
import { useMediaQuery } from '/shared/composables.js'
import { healthSummary } from '/shared/health.js'
import { routeParams } from '/shared/router.js'

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
    <div v-page-reveal class="sd-map">
      <div class="sd-map-diagram">
        <system-diagram interactive :focus="focus" @select="select" />
      </div>
      <aside v-if="sideCard" class="sd-map-card" aria-live="polite">
        <template v-if="piece">
          <h3 class="sd-map-card-title">{{ piece.title }}</h3>
          <piece-detail :piece="piece" :status="status" />
          <div v-if="piece.links.length" class="sd-map-card-actions">
            <a v-for="link in piece.links" :key="link.href" class="ui-button ui-button-secondary ui-button-block" :href="link.href">Open {{ link.label }}</a>
          </div>
        </template>
        <p v-else class="sd-map-card-empty">Select a component in the diagram.</p>
      </aside>
      <ui-sheet v-if="!sideCard" :open="sheetOpen" :title="piece ? piece.title : 'System diagram'" @close="closeSheet">
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

    const closeSheet = () => {
      sheetOpen.value = false
      selected.value = ''
    }

    watch(() => focusedPieceOf(routeParams.value), (id) => {
      if (id) select(id)
    }, { immediate: true })

    onMounted(() => {
      fetchSettings().then((value) => { settings.value = value }, () => {})
      if (!serverAbout.value?.version) fetchServerAbout().catch(() => {})
      api('GET', '/api/live/tuner-status').then((value) => { tuners.value = value }, () => {})
      api('GET', '/api/tvh-guide/status').then((value) => { guide.value = value?.suggestion ?? null }, () => {})
    })

    return { sideCard, sheetOpen, piece, focus, status, select, closeSheet }
  },
}

const SIDE_CARD_QUERY = '(min-width: 1100px) and (min-height: 501px)'
