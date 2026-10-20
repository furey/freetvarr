import { ref, computed, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { streamChoicesOf, isOverMeasured, measuredText } from '/tuner-status.js'
import { TunerList, useTunerStatusWhile } from '/components/tuner-list.js'
import { api } from '/shared/api.js'
import { multi } from '/shared/multi-session.js'
import { routeParams } from '/shared/router.js'
import { fmtTime } from '/shared/time.js'

export const LiveStreamsSetting = {
  template: `
    <div class="settings-group">
      <h3 class="ui-group-label">Live TV</h3>
      <div class="ui-group">
        <div class="settings-row">
          <span id="live-streams-label" class="field-label">Live streams at once</span>
          <div class="ui-segmented live-streams-choices" role="group" aria-labelledby="live-streams-label">
            <button v-for="choice in choices" :key="choice.value" type="button" class="ui-segment"
              :class="{ 'is-over-estimate': choice.tooMany }" :aria-pressed="String(current === choice.value)"
              :disabled="saving || !loaded" @click="choose(choice.value)">{{ choice.label }}</button>
          </div>
          <p class="settings-hint">Two lets you watch two channels at once in Multiview.</p>
          <p class="settings-hint" :class="{ 'live-streams-warn': overMeasured }">{{ measured }}</p>
          <div class="settings-row-actions">
            <button type="button" class="btn btn-sm" :disabled="measuring || !loaded" @click="measure">
              <template v-if="measuring">Measuring…</template><template v-else><pulse-icon /> Measure again</template>
            </button>
            <span v-if="statusText" :class="['status-readout', statusKind]">{{ statusText }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const state = ref(null)
    const saving = ref(false)
    const measuring = ref(false)
    const statusText = ref('')
    const statusKind = ref('info')
    const loaded = computed(() => Boolean(state.value))
    const benchmark = computed(() => state.value?.benchmark || null)
    const current = computed(() => state.value?.max_live_streams ?? null)
    const choices = computed(() => streamChoicesOf({ choices: state.value?.choices || [1, 2], benchmark: benchmark.value }))
    const overMeasured = computed(() => isOverMeasured({ benchmark: benchmark.value, chosen: current.value }))
    const measured = computed(() => measuredText({ benchmark: benchmark.value, chosen: current.value, clockText: fmtTime }))

    const load = async () => {
      try {
        state.value = await api('GET', '/api/live-streams')
      } catch (err) {
        statusText.value = `Could not load: ${err.message}`
        statusKind.value = 'err'
      }
    }

    const choose = async (value) => {
      if (value === current.value) return
      saving.value = true
      statusText.value = ''
      try {
        state.value = await api('PUT', '/api/live-streams', { max_live_streams: value })
        statusText.value = 'Saved.'
        statusKind.value = 'ok'
      } catch (err) {
        statusText.value = `Not saved: ${err.message}`
        statusKind.value = 'err'
      } finally {
        saving.value = false
      }
    }

    const measure = async () => {
      measuring.value = true
      statusText.value = 'Measuring. This takes up to 30 seconds.'
      statusKind.value = 'busy'
      try {
        const r = await api('POST', '/api/live/benchmark')
        state.value = { ...state.value, benchmark: r.benchmark }
        statusText.value = 'Measured.'
        statusKind.value = 'ok'
        load()
      } catch (err) {
        statusText.value = err.code === 'busy' ? 'Measure again once live TV, playback, and ad scans finish.' : `Could not measure: ${err.message}`
        statusKind.value = 'err'
      } finally {
        measuring.value = false
      }
    }

    onMounted(load)

    return { loaded, saving, measuring, current, choices, overMeasured, measured, statusText, statusKind, choose, measure }
  },
}

export const TunerStatusPanel = {
  components: { 'tuner-list': TunerList },
  template: `
    <div class="settings-group">
      <h3 class="ui-group-label">Tuners</h3>
      <tuner-list v-if="multi.tunerLoaded" :status="multi.tunerStatus" />
      <p v-else class="settings-note">Checking tuners…</p>
      <p v-if="multi.tunerLoaded && multi.tunerStatus.configured !== false" class="settings-note">
        {{ summary }} Recordings always come first.
      </p>
    </div>
  `,
  setup() {
    useTunerStatusWhile(() => routeParams.value.includes('tvheadend'))
    const summary = computed(() => {
      const { total, inUse } = multi.tunerStatus
      return total === 1 ? `${inUse} of 1 tuner in use.` : `${inUse} of ${total} tuners in use.`
    })
    return { multi, summary }
  },
}
