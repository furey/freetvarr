import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  watch,
} from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { usePacedJob, SETUP_POLL_MS, secureStepDot } from '/views/welcome-shared.js'

export const GuideSetupStep = {
  props: {
    tvhUrl: { type: String, default: '' },
  },
  emits: ['state', 'back'],
  template: `
    <div class="space-y-4">
      <p v-if="loading && !status" class="status-readout busy">Reading the TV guide settings…</p>

      <div v-else-if="loadError" class="space-y-2">
        <p class="status-readout err">{{ loadError }}</p>
        <button type="button" class="btn" @click="refresh"><refresh-icon /> CHECK AGAIN</button>
      </div>

      <template v-else-if="suggestion">
        <div v-if="showSteps" class="space-y-3">
          <ol class="space-y-1 text-sm font-mono">
            <li v-for="s in steps" :key="s.id" class="step-row">
              <span class="step-marker">
                <span v-if="s.status === 'running'" class="step-spinner"></span>
                <span v-else :class="['led-dot', 'sm', secureStepDot(s.status)]"></span>
              </span>
              <span :class="s.status === 'pending' ? 'text-ink-mute' : 'text-ink'">
                {{ s.label }}<span v-if="stepDetail(s)" class="text-ink-dim"> · {{ stepDetail(s) }}</span>
              </span>
            </li>
          </ol>
          <template v-if="result && result.ok">
            <div v-if="!result.total" class="space-y-2">
              <p class="status-readout err">There are no channels yet, so there is nothing to link a guide to.</p>
              <button type="button" class="btn" @click="$emit('back')"><arrow-left-icon /> BACK TO CHANNELS</button>
            </div>
            <p v-else class="status-readout ok">{{ result.linked }} of {{ result.total }} channels have a guide.</p>
            <div v-if="result.unmatched.length" class="space-y-3">
              <p class="text-sm text-ink">These channels have no guide yet. Check each pick, or choose No guide. NEXT saves your choices.</p>
              <div v-for="c in result.unmatched" :key="c.id" class="grid gap-2 md:grid-cols-2 items-center">
                <label class="text-sm text-ink" :for="'guide-' + c.id">{{ c.name }}<span v-if="c.number" class="text-ink-dim"> · {{ c.number }}</span></label>
                <guide-combobox :input-id="'guide-' + c.id" v-model="picks[c.id]" :options="result.options"
                  none-label="No guide" :label="'Guide for ' + c.name" />
              </div>
            </div>
          </template>
          <div v-if="result && !result.ok" class="space-y-2">
            <p class="status-readout err">{{ result.error }}</p>
            <p v-if="result.next" class="text-sm text-ink">{{ result.next }}</p>
            <button type="button" class="btn" @click="restart"><refresh-icon /> TRY AGAIN</button>
          </div>
        </div>

        <div v-else-if="!suggestion.channels" class="space-y-2">
          <p class="status-readout err">There are no channels yet, so there is nothing to link a guide to.</p>
          <p class="text-sm text-ink">Go back to CHANNELS and scan for channels first. Then come back here to set up the guide.</p>
          <button type="button" class="btn" @click="$emit('back')"><arrow-left-icon /> BACK TO CHANNELS</button>
        </div>

        <div v-else-if="!suggestion.available" class="space-y-2">
          <p class="text-sm text-ink">This TVHeadend cannot download a guide from an address. It uses the guide that comes with the broadcast. Press NEXT.</p>
        </div>

        <div v-else-if="suggestion.state === 'has-guide' && !editing" class="space-y-2">
          <p class="status-readout ok">{{ suggestion.linked }} of {{ suggestion.channels }} channels have a guide.</p>
          <p class="text-sm text-ink-dim break-all">Guide address: {{ suggestion.url }}</p>
          <p class="text-sm text-ink-dim">Press NEXT to keep it. To link channels that have no guide, or to change the address, set it up again.</p>
          <button type="button" class="btn" @click="editing = true"><refresh-icon /> SET UP AGAIN</button>
        </div>

        <div v-else class="space-y-4">
          <p class="text-ink text-sm leading-relaxed">
            A guide feed gives Freetvarr a week of listings with episode numbers, so it can record a show by name.
          </p>
          <div v-if="suggestion.feeds.length" class="field-row">
            <label class="field-label" for="guide-feed">Guide</label>
            <select id="guide-feed" class="field-input" v-model="choice">
              <option value="">Pick a region</option>
              <option v-for="f in suggestion.feeds" :key="f.url" :value="f.url">{{ f.region }}</option>
              <option :value="OTHER">Another address</option>
            </select>
          </div>
          <p v-else class="text-sm text-ink-dim">
            Freetvarr has no free guide feed for your country yet. TVHeadend uses the guide that comes with the broadcast. If you have an XMLTV guide address, enter it below.
          </p>
          <div v-if="!suggestion.feeds.length || choice === OTHER" class="field-row">
            <label class="field-label" for="guide-url">Guide address (XMLTV)</label>
            <input v-no-autofill id="guide-url" v-autofocus type="text" class="field-input" v-model="customUrl" placeholder="https://example.com/epg.xml" />
          </div>
          <div class="action-row flex flex-wrap items-center gap-3">
            <button type="button" class="btn btn-primary" @click="apply" :disabled="!url || starting">
              <tv-icon /> SET UP GUIDE
            </button>
          </div>
          <p v-if="applyError" class="status-readout err">{{ applyError }}</p>
          <p v-if="suggestion.linked" class="text-xs text-ink-mute">Freetvarr keeps the guide links you already have.</p>
          <manual-option v-if="tvhUrl" :href="tvhUrl" label="Open TVHeadend">
            Load a guide yourself in TVHeadend, then come back here.
          </manual-option>
        </div>
      </template>
    </div>
  `,
  setup(props, { emit }) {
    const OTHER = 'other'
    const status = ref(null)
    const loading = ref(false)
    const loadError = ref('')
    const editing = ref(false)
    const choice = ref('')
    const customUrl = ref('')
    const job = ref(null)
    const paced = usePacedJob(job)
    let jobDismissed = false
    const starting = ref(false)
    const applyError = ref('')
    const picks = reactive({})
    let pollTimer = null

    const suggestion = computed(() => status.value?.suggestion || null)
    const url = computed(() => (choice.value && choice.value !== OTHER ? choice.value : customUrl.value.trim()))
    const steps = computed(() => paced.shown.value.steps)
    const result = computed(() => paced.shown.value.result)
    const running = computed(() => paced.shown.value.running)
    const showSteps = computed(() => running.value || Boolean(result.value))
    const linked = computed(() => (result.value?.ok ? result.value.linked : suggestion.value?.linked || 0))
    const pickedCount = computed(() => Object.values(picks).filter(Boolean).length)

    watch([running, starting, linked, pickedCount], () => {
      emit('state', { busy: running.value || starting.value, linked: linked.value, pending: pickedCount.value })
    }, { immediate: true })

    watch(() => result.value?.unmatched, (unmatched) => {
      for (const c of unmatched || []) if (!(c.id in picks)) picks[c.id] = c.guess || ''
    }, { immediate: true })

    const prefill = (s) => {
      const known = (s?.feeds || []).some((f) => f.url === s?.url)
      choice.value = known ? s.url : s?.url ? OTHER : ''
      customUrl.value = known ? '' : s?.url || ''
    }

    const adoptJob = (serverJob) => {
      if (!serverJob) return
      if (!serverJob.running && (jobDismissed || job.value)) return
      const wasRunning = Boolean(job.value?.running)
      job.value = serverJob
      if (!serverJob.running) return paced.showAll()
      startPolling()
      if (!wasRunning) paced.begin()
    }

    const refresh = async () => {
      loading.value = true
      loadError.value = ''
      try {
        const r = await api('GET', '/api/tvh-guide/status')
        status.value = r
        adoptJob(r.job)
        prefill(r.suggestion)
      } catch (err) {
        loadError.value = err.message
      } finally {
        loading.value = false
      }
    }

    const startPolling = () => {
      clearInterval(pollTimer)
      pollTimer = setInterval(async () => {
        const progress = await api('GET', '/api/tvh-guide/progress').catch(() => null)
        if (!progress) return
        job.value = progress
        if (!progress.running) clearInterval(pollTimer)
      }, SETUP_POLL_MS)
    }

    const apply = async () => {
      starting.value = true
      applyError.value = ''
      try {
        const r = await api('POST', '/api/tvh-guide/apply', { url: url.value })
        jobDismissed = false
        job.value = { running: true, steps: r.steps, result: null }
        paced.begin()
        startPolling()
      } catch (err) {
        applyError.value = err.message
      } finally {
        starting.value = false
      }
    }

    const saveLinks = async () => {
      if (!pickedCount.value) return
      const links = Object.entries(picks).filter(([, g]) => g).map(([channel_id, guide_id]) => ({ channel_id, guide_id }))
      await api('POST', '/api/tvh-guide/links', { links })
      for (const { channel_id } of links) delete picks[channel_id]
      const progress = await api('GET', '/api/tvh-guide/progress').catch(() => null)
      if (progress) job.value = progress
    }

    const restart = () => {
      jobDismissed = true
      job.value = null
      editing.value = true
      refresh()
    }

    const stepDetail = (s) => (s.id === 'download' && s.detail?.expected && s.detail.found
      ? `${s.detail.found} of ${s.detail.expected} guide channels loaded`
      : '')

    onMounted(refresh)
    onUnmounted(() => clearInterval(pollTimer))

    return {
      OTHER, status, loading, loadError, editing, suggestion, choice, customUrl, url,
      steps, result, showSteps, starting, applyError, picks, pickedCount,
      refresh, apply, saveLinks, restart, stepDetail, secureStepDot,
    }
  },
}
