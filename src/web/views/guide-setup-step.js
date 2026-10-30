import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  watch,
} from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { usePacedJob, SETUP_POLL_MS, SetupRunList } from '/views/welcome-shared.js'

export const GuideSetupStep = {
  props: {
    tvhUrl: { type: String, default: '' },
    actionInBar: { type: Boolean, default: false },
    startEditing: { type: Boolean, default: false },
  },
  emits: ['state', 'back'],
  components: { SetupRunList },
  template: `
    <div class="setup-body">
      <p v-if="!actionInBar" class="setup-hint">{{ intro }}</p>
      <setup-run-list v-if="loading && !status" :steps="READING_STEPS" />

      <div v-else-if="loadError" class="setup-block">
        <p class="setup-hint is-error">{{ loadError }}</p>
        <button type="button" class="setup-quiet-link" @click="refresh">Check again</button>
      </div>

      <template v-else-if="suggestion">
        <template v-if="showSteps">
          <div class="setup-block">
            <setup-run-list :steps="steps" />
          </div>
          <div v-if="result && result.ok && !result.total" class="setup-block">
            <button v-if="actionInBar" type="button" class="setup-quiet-link" @click="$emit('back')">Back to Channels</button>
          </div>
          <div v-if="result && result.ok && result.unmatched.length" class="setup-block">
            <h2 class="ui-group-label">Channels without a guide</h2>
            <div class="ui-group">
              <div v-for="c in result.unmatched" :key="c.id" class="setup-select-row">
                <label class="ui-group-row-main" :for="'guide-' + c.id">
                  <span class="ui-group-row-title">{{ c.name }}</span>
                  <span v-if="c.number" class="ui-group-row-meta ui-tabular">{{ c.number }}</span>
                </label>
                <guide-combobox :input-id="'guide-' + c.id" v-model="picks[c.id]" :options="result.options"
                  none-label="No guide" :label="'Guide for ' + c.name" />
              </div>
            </div>
            <p class="setup-hint">Check each pick, or choose No guide.<template v-if="actionInBar"> Save and next keeps your choices.</template></p>
            <div v-if="!actionInBar && pickedCount" class="setup-inline-actions">
              <button type="button" class="ui-button ui-button-primary" @click="saveLinks">Save guide choices</button>
            </div>
          </div>
          <div v-if="result && result.ok && result.total" class="setup-block">
            <button type="button" class="setup-quiet-link" @click="restart">Set up the guide again</button>
          </div>
          <div v-if="result && !result.ok" class="setup-block">
            <p class="setup-hint is-error">{{ result.error }}</p>
            <p v-if="result.next" class="setup-hint">{{ result.next }}</p>
            <button type="button" class="setup-quiet-link" @click="restart">Try again</button>
          </div>
        </template>

        <div v-else-if="!suggestion.channels" class="setup-block">
          <button v-if="actionInBar" type="button" class="setup-quiet-link" @click="$emit('back')">Back to Channels</button>
        </div>

        <div v-else-if="!suggestion.available" class="setup-block"></div>

        <div v-else-if="suggestion.state === 'has-guide' && !editing" class="setup-block">
          <div class="ui-group">
            <div class="ui-group-row">
              <span class="ui-group-row-main"><span class="ui-group-row-title">Guide address</span><span class="ui-group-row-meta setup-mono">{{ suggestion.url }}</span></span>
            </div>
          </div>
          <button type="button" class="setup-quiet-link" @click="editing = true">Set up the guide again</button>
        </div>

        <div v-else class="setup-block">
          <div class="setup-fields">
            <div v-if="suggestion.feeds.length" class="field-row">
              <label class="field-label" for="guide-feed">Guide</label>
              <select id="guide-feed" class="field-input" v-model="choice">
                <option value="">Pick a region</option>
                <option v-for="f in suggestion.feeds" :key="f.url" :value="f.url">{{ f.region }}</option>
                <option :value="OTHER">Another address</option>
              </select>
            </div>
            <div v-if="!suggestion.feeds.length || choice === OTHER" class="field-row">
              <label class="field-label" for="guide-url">Guide address (XMLTV)</label>
              <input v-no-autofill id="guide-url" v-autofocus type="text" class="field-input" v-model="customUrl" placeholder="https://example.com/epg.xml" />
            </div>
          </div>
          <p v-if="!suggestion.feeds.length" class="setup-hint">Freetvarr has no free guide feed for your country yet. TVHeadend uses the guide that comes with the broadcast. If you have an XMLTV guide address, enter it above.</p>
          <p v-if="suggestion.linked" class="setup-hint">Freetvarr keeps the guide links you already have.</p>
          <p v-if="applyError" class="setup-hint is-error">{{ applyError }}</p>
          <div v-if="!actionInBar" class="setup-inline-actions">
            <button type="button" class="ui-button ui-button-primary" @click="apply" :disabled="!url || starting">Set up guide</button>
          </div>
          <a v-if="tvhUrl" class="setup-quiet-link" :href="tvhUrl" target="_blank" rel="noopener">Load a guide yourself in TVHeadend</a>
        </div>
      </template>
    </div>
  `,
  setup(props, { emit }) {
    const OTHER = 'other'
    const status = ref(null)
    const loading = ref(false)
    const loadError = ref('')
    const editing = ref(props.startEditing)
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

    const total = computed(() => (result.value?.ok ? result.value.total : suggestion.value?.channels || 0))
    const region = computed(() => (suggestion.value?.feeds || []).find((f) => f.url === (url.value || suggestion.value?.url))?.region || '')
    const formShown = computed(() => Boolean(suggestion.value) && !showSteps.value && !loadError.value
      && Boolean(suggestion.value.channels) && suggestion.value.available
      && (suggestion.value.state !== 'has-guide' || editing.value))
    const intro = computed(() => guideIntro({
      loading: loading.value && !status.value,
      loadError: loadError.value,
      suggestion: suggestion.value,
      editing: editing.value,
      running: showSteps.value && !result.value,
      result: result.value,
    }))

    watch([running, starting, linked, pickedCount, formShown, url, intro, total, region], () => {
      emit('state', {
        busy: running.value || starting.value,
        linked: linked.value,
        total: total.value,
        region: region.value,
        pending: pickedCount.value,
        action: formShown.value ? { label: 'Set up guide', disabled: !url.value || starting.value } : null,
        intro: intro.value,
      })
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

    onMounted(refresh)
    onUnmounted(() => clearInterval(pollTimer))

    return {
      OTHER, status, loading, loadError, editing, suggestion, choice, customUrl, url,
      steps, result, showSteps, starting, applyError, picks, pickedCount,
      refresh, apply, saveLinks, restart, runAction: apply, READING_STEPS, intro,
    }
  },
}

const guideIntro = ({ loading, loadError, suggestion, editing, running, result }) => {
  if (loading) return 'Freetvarr reads the TV guide settings from TVHeadend.'
  if (loadError) return 'Freetvarr could not read the TV guide settings from TVHeadend.'
  if (running) return 'Setting up the guide. This takes a minute.'
  if (result?.ok && !result.total) return 'There are no channels yet, so there is nothing to link a guide to.'
  if (result?.ok) {
    const others = result.unmatched.length
    return `${result.linked} of ${result.total} channels have a guide.${others ? ` Check the picks for the other ${others === 1 ? 'one' : others}.` : ''}`
  }
  if (result) return 'The guide setup stopped.'
  if (!suggestion?.channels) return 'There are no channels yet, so there is nothing to link a guide to. Scan for channels first.'
  if (!suggestion.available) return 'This TVHeadend cannot download a guide from an address. It uses the guide that comes with the broadcast. Press Next.'
  if (suggestion.state === 'has-guide' && !editing) return `${suggestion.linked} of ${suggestion.channels} channels have a guide. Press Next to keep it.`
  return 'A guide feed gives Freetvarr a week of listings with episode numbers, so it can record a show by name.'
}

const READING_STEPS = [{ id: 'read', label: 'Read the TV guide settings', status: 'running' }]
