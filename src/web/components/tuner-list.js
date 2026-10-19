import { computed, watch, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { tunerMeterOf, tunerToneOf, tunerExplainerOf } from '/tuner-status.js'
import { multi, watchTunerStatus } from '/shared/multi-session.js'

export const TunerCells = {
  props: { cells: { type: Array, default: () => [] } },
  template: `
    <span class="tuner-cells" aria-hidden="true">
      <i v-for="cell in cells" :key="cell.key" :class="['tuner-cell', 'is-' + cell.tone]"></i>
    </span>
  `,
}

export const TunerList = {
  components: { 'tuner-cells': TunerCells },
  props: { status: { type: Object, required: true } },
  template: `
    <div class="ui-group tuner-list">
      <div v-for="row in rows" :key="row.key" class="ui-group-row">
        <tuner-cells :cells="[row]" />
        <span class="ui-group-row-main">
          <span class="ui-group-row-title">{{ row.label }}</span>
          <span v-if="row.name" class="ui-group-row-meta">{{ row.name }}</span>
        </span>
      </div>
      <p v-if="!rows.length" class="ui-group-row ui-meta">TVHeadend reports no tuners.</p>
    </div>
  `,
  setup(props) {
    const rows = computed(() => (props.status.tuners || []).map((tuner, index) => ({
      key: index, tone: tunerToneOf(tuner), label: tuner.label, name: tuner.name,
    })))
    return { rows }
  },
}

export const TunerExplainerSheet = {
  components: { 'tuner-list': TunerList },
  props: { open: Boolean },
  emits: ['close'],
  template: `
    <ui-sheet :open="open" title="How tuners work" @close="$emit('close')">
      <tuner-list :status="multi.tunerStatus" />
      <div class="tuner-explainer">
        <p v-for="line in lines" :key="line">{{ line }}</p>
      </div>
    </ui-sheet>
  `,
  setup(props) {
    const lines = computed(() => tunerExplainerOf(multi.tunerStatus))
    useTunerStatusWhile(() => props.open)
    return { multi, lines }
  },
}

export const useTunerStatusWhile = (isOn) => {
  let release = null
  watch(isOn, (on) => {
    if (on && !release) release = watchTunerStatus()
    if (!on && release) {
      release()
      release = null
    }
  }, { immediate: true })
  onUnmounted(() => release?.())
}

export const tunerMeter = computed(() => tunerMeterOf(multi.tunerStatus))
