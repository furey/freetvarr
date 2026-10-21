import { ref, computed, watch, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import {
  KEEP_OPTIONS,
  LAG_OPTIONS,
  LEAD_OPTIONS,
  canStep,
  channelChipsOf,
  guideMatchesFor,
  keepLabel,
  paddingLabel,
  sheetIntroOf,
  stepOption,
} from '/show-page.js'
import { api, fetchSettings } from '/shared/api.js'
import { episodeRecordingFor, stopOutcomeFor } from '/shared/recording-helpers.js'
import { refreshAfterRecordingChange } from '/shared/recording-now.js'
import { mediaRootPrefix } from '/views/folder-editor.js'
import { AlsoKnownAs } from '/components/also-known-as.js'

const RULE_SAVE_DELAY_MS = 600
const DEFAULT_LEAD_MINUTES = 2
const DEFAULT_LAG_MINUTES = 10

export const RecordingOptionsSheet = {
  components: { AlsoKnownAs },
  props: {
    open: Boolean,
    show: { type: Object, required: true },
  },
  emits: ['close', 'changed', 'stopped', 'flash'],
  template: `
    <ui-sheet :open="open" :title="stage === 'stop' ? 'Stop recording this show' : 'Recording options'"
      :subtitle="stage === 'stop' ? '' : intro" @close="close">
      <template #header-actions>
        <button v-if="stage === 'options'" type="button" class="ui-button ui-button-primary ui-button-sm options-done" @click="close">Done</button>
      </template>

      <template v-if="stage === 'stop'">
        <cancel-series-step :title="show.title" :episode-outcome="episodeOutcome" :title-match="rule.folder"
          :busy="busy" @confirm="stopRecording" @back="stage = 'options'" />
      </template>

      <template v-else>
        <div class="options-field">
          <h3 class="options-label" id="options-channels-label">Channels</h3>
          <div class="ui-chip-row" role="group" aria-labelledby="options-channels-label">
            <button v-for="chip in chips" :key="chip.key" type="button" class="ui-chip" :aria-pressed="String(chip.on)"
              :disabled="busy || !canToggle(chip)" @click="toggleChannel(chip)">{{ chip.label }}</button>
          </div>
          <p v-if="!guideMatches.length && searched" class="options-hint">Other channels appear here when the show is in the guide.</p>
        </div>

        <div class="ui-group options-group">
          <div class="ui-group-row">
            <span class="ui-group-row-main" id="options-keep-label">Keep the latest</span>
            <div class="ui-stepper" role="group" aria-labelledby="options-keep-label">
              <button type="button" class="ui-stepper-button" aria-label="Keep fewer" :disabled="!canStep({ options: KEEP_OPTIONS, value: keep, direction: -1 })" @click="step('keep', -1)">−</button>
              <span class="ui-stepper-value" aria-live="polite">{{ keepLabel(keep) }}</span>
              <button type="button" class="ui-stepper-button" aria-label="Keep more" :disabled="!canStep({ options: KEEP_OPTIONS, value: keep, direction: 1 })" @click="step('keep', 1)">+</button>
            </div>
          </div>
          <div class="ui-group-row">
            <span class="ui-group-row-main" id="options-lead-label">Start early</span>
            <div class="ui-stepper" role="group" aria-labelledby="options-lead-label">
              <button type="button" class="ui-stepper-button" aria-label="Start later" :disabled="!canStep({ options: LEAD_OPTIONS, value: lead, direction: -1 })" @click="step('lead', -1)">−</button>
              <span class="ui-stepper-value" aria-live="polite">{{ paddingLabel(lead) }}</span>
              <button type="button" class="ui-stepper-button" aria-label="Start earlier" :disabled="!canStep({ options: LEAD_OPTIONS, value: lead, direction: 1 })" @click="step('lead', 1)">+</button>
            </div>
          </div>
          <div class="ui-group-row">
            <span class="ui-group-row-main" id="options-lag-label">Finish late</span>
            <div class="ui-stepper" role="group" aria-labelledby="options-lag-label">
              <button type="button" class="ui-stepper-button" aria-label="Finish sooner" :disabled="!canStep({ options: LAG_OPTIONS, value: lag, direction: -1 })" @click="step('lag', -1)">−</button>
              <span class="ui-stepper-value" aria-live="polite">{{ paddingLabel(lag) }}</span>
              <button type="button" class="ui-stepper-button" aria-label="Finish later" :disabled="!canStep({ options: LAG_OPTIONS, value: lag, direction: 1 })" @click="step('lag', 1)">+</button>
            </div>
          </div>
          <div class="ui-group-row">
            <span class="ui-group-row-main">
              <span class="ui-group-row-title" id="options-ads-label">Remove ads</span>
              <span v-if="adsNote" class="ui-group-row-meta">{{ adsNote }}</span>
            </span>
            <toggle-switch :model-value="removeAds" aria-labelledby="options-ads-label"
              :disabled="busy || Boolean(adsNote)" @update:model-value="toggleAds" />
          </div>
          <div class="ui-group-row">
            <span class="ui-group-row-main"><span class="ui-group-row-title" id="options-pause-label">Pause recording</span></span>
            <toggle-switch :model-value="paused" aria-labelledby="options-pause-label"
              :disabled="busy" @update:model-value="togglePause" />
          </div>
        </div>

        <details class="options-advanced">
          <summary class="ui-disclosure-summary">Advanced</summary>
          <div class="options-advanced-body">
            <template v-if="rule.folder && !editingFolder">
              <div>
                <h3 class="options-label">Saves to</h3>
                <p class="ui-mono options-value">{{ rule.savesTo?.path || mediaRootPrefix(mediaRoot) + rule.folder.dest_folder }}</p>
              </div>
              <div>
                <h3 class="options-label">Also match titles containing</h3>
                <p class="ui-mono options-value">{{ rule.folder.show_pattern }}</p>
              </div>
              <button type="button" class="ui-button ui-button-sm options-edit" @click="editingFolder = true">Edit folder and title match</button>
            </template>
            <series-folder-editor v-else-if="rule.folder" class="options-folder-editor" :folder="rule.folder" :folders="folders"
              :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled" is-series :import-unmatched="importUnmatched"
              @saved="onFolderChanged('Saved the folder.')" @deleted="onFolderChanged('Unassigned the folder.')" @cancel="editingFolder = false" />
            <form v-else class="options-assign" @submit.prevent="assignFolder">
              <p class="options-hint">{{ unassignedText }}</p>
              <label class="options-label" for="options-assign-folder">Folder in your TV library</label>
              <div class="options-assign-row">
                <span class="ui-mono options-prefix">{{ mediaRootPrefix(mediaRoot) }}</span>
                <input v-no-autofill id="options-assign-folder" v-model="assignDest" class="options-input" type="text" list="options-assign-folders" />
              </div>
              <datalist id="options-assign-folders"><option v-for="d in folders" :key="d" :value="d" /></datalist>
              <button type="submit" class="ui-button ui-button-sm" :disabled="busy || !assignDest.trim()">Assign folder</button>
            </form>
            <also-known-as :show-key="show.key" @flash="$emit('flash', $event)" />
          </div>
        </details>
        <p class="options-hint options-advanced-hint">Open Advanced to see where files are saved, any title matching, and other names for the show.</p>
        <p class="ui-visually-hidden" aria-live="polite">{{ statusText }}</p>
      </template>

      <template v-if="stage === 'options'" #footer>
        <button type="button" class="ui-button ui-button-destructive ui-button-block options-stop" :disabled="busy" @click="stage = 'stop'">Stop recording this show</button>
      </template>
    </ui-sheet>
  `,
  setup(props, { emit }) {
    const stage = ref('options')
    const keep = ref(0)
    const lead = ref(DEFAULT_LEAD_MINUTES)
    const lag = ref(DEFAULT_LAG_MINUTES)
    const removeAds = ref(false)
    const paused = ref(false)
    const busy = ref(false)
    const statusText = ref('')
    const guideMatches = ref([])
    const searched = ref(false)
    const adRemovalEnabled = ref(false)
    const mediaRoot = ref('')
    const importUnmatched = ref(true)
    const folders = ref([])
    const editingFolder = ref(false)
    const assignDest = ref('')
    const pendingPatch = ref({})

    const rule = computed(() => props.show.rule)
    const intro = computed(() => sheetIntroOf({ show: { ...props.show, rule: { ...rule.value, paused: paused.value } } }))
    const chips = computed(() => channelChipsOf({ autorecs: rule.value.autorecs || [], guideMatches: guideMatches.value }))
    const episodeOutcome = computed(() => stopOutcomeFor(episodeRecordingFor((rule.value.autorecs || []).map((a) => a.id))))
    const adsNote = computed(() => {
      if (!adRemovalEnabled.value) return 'Turn on ad removal in Settings first.'
      if (!rule.value.folder) return 'Assign a folder in Advanced first.'
      return ''
    })
    const unassignedText = computed(() => (rule.value.savesTo?.path
      ? `This show has no folder in your TV library, so its episodes save to ${rule.value.savesTo.path}.`
      : 'This show has no folder in your TV library, so its episodes wait in the recording log.'))

    const resetFromShow = () => {
      const autorecs = rule.value.autorecs || []
      keep.value = rule.value.episodesToKeep || 0
      lead.value = maxOf(autorecs.map((a) => a.leadTime), DEFAULT_LEAD_MINUTES)
      lag.value = maxOf(autorecs.map((a) => a.lagTime), DEFAULT_LAG_MINUTES)
      removeAds.value = rule.value.adRemoval === 'cut'
      paused.value = Boolean(rule.value.paused)
      stage.value = 'options'
      editingFolder.value = false
    }

    const loadContext = async () => {
      const [settings, search, suggest] = await Promise.all([
        fetchSettings().catch(() => ({})),
        api('GET', `/api/epg/search?q=${encodeURIComponent(props.show.title)}`).catch(() => ({ results: [] })),
        api('GET', `/api/folder-suggest?show=${encodeURIComponent(props.show.title)}`).catch(() => ({})),
      ])
      adRemovalEnabled.value = Boolean(settings.ad_removal_enabled)
      mediaRoot.value = settings.media_root || ''
      importUnmatched.value = settings.import_unmatched !== false
      guideMatches.value = guideMatchesFor({ results: search.results || [], key: props.show.key })
      searched.value = true
      folders.value = suggest.folders || []
      assignDest.value = suggest.match?.folder || folderNameFor(props.show.title)
    }

    watch(() => props.open, (isOpen) => {
      if (!isOpen) return
      resetFromShow()
      loadContext()
    }, { immediate: true })

    const announce = (text) => {
      statusText.value = text
    }

    const fail = (what, err) => emit('flash', { msg: `${what} failed: ${err.message}`, kind: 'error', ms: 8000 })

    let saveTimer = null
    const flushRulePatch = async () => {
      clearTimeout(saveTimer)
      const patch = pendingPatch.value
      pendingPatch.value = {}
      if (!Object.keys(patch).length) return
      try {
        await api('PATCH', `/api/library/shows/${encodeURIComponent(props.show.key)}/rule`, patch)
        announce('Saved.')
        emit('changed')
      } catch (err) {
        fail('Saving the recording options', err)
      }
    }

    const step = (field, direction) => {
      const steppers = {
        keep: { value: keep, options: KEEP_OPTIONS, body: 'episodes_to_keep' },
        lead: { value: lead, options: LEAD_OPTIONS, body: 'lead_time' },
        lag: { value: lag, options: LAG_OPTIONS, body: 'lag_time' },
      }
      const stepper = steppers[field]
      stepper.value.value = stepOption({ options: stepper.options, value: stepper.value.value, direction })
      pendingPatch.value = { ...pendingPatch.value, [stepper.body]: stepper.value.value }
      clearTimeout(saveTimer)
      saveTimer = setTimeout(flushRulePatch, RULE_SAVE_DELAY_MS)
    }

    const runBusy = async (what, task) => {
      busy.value = true
      try {
        await task()
        refreshAfterRecordingChange()
        emit('changed')
      } catch (err) {
        fail(what, err)
      } finally {
        busy.value = false
      }
    }

    const toggleAds = () => runBusy('Changing ad removal', async () => {
      const next = !removeAds.value
      await api('PATCH', `/api/shows/${rule.value.folder.id}`, { ad_removal: next ? 'cut' : 'off' })
      removeAds.value = next
      announce(next ? 'Ads will be removed.' : 'Ads will stay in.')
    })

    const togglePause = () => runBusy('Pausing', async () => {
      const next = !paused.value
      await api('POST', '/api/epg/pause-series', { series_link_ids: (rule.value.autorecs || []).map((a) => a.seriesLinkId), paused: next })
      paused.value = next
      announce(next ? 'Paused.' : 'Recording again.')
    })

    const onChannels = computed(() => chips.value.filter((chip) => chip.on))

    const canToggle = (chip) => {
      if (chip.on) return chip.key !== 'any' && onChannels.value.length > 1
      return Boolean(chip.autorec || chip.match)
    }

    const recordChannel = ({ match, anyChannel }) => api('POST', '/api/epg/record-series', {
      series_link: match.series_link,
      channel_id: match.channelId ?? match.channel_id,
      program_id: match.program_id,
      epg_program_id: match.epg_program_id ?? match.program_id,
      lead_time: lead.value,
      lag_time: lag.value,
      episodes_to_keep: keep.value,
      add_show_rule: false,
      any_channel: anyChannel,
      paused: paused.value,
    })

    const cancelAutorecs = (autorecs) => (autorecs.length
      ? api('POST', '/api/epg/cancel-series', { series_link_ids: autorecs.map((a) => a.seriesLinkId) })
      : null)

    const toggleChannel = (chip) => runBusy('Changing channels', async () => {
      const autorecs = rule.value.autorecs || []
      if (chip.on) {
        await cancelAutorecs([chip.autorec])
        announce(`Stopped recording on ${chip.label}.`)
        return
      }
      if (chip.key === 'any') {
        await recordChannel({ match: chip.match, anyChannel: true })
        await cancelAutorecs(autorecs.filter((a) => !a.anyChannel))
        announce('Records on any channel.')
        return
      }
      if (!chip.autorec) await recordChannel({ match: chip.match, anyChannel: false })
      await cancelAutorecs(autorecs.filter((a) => a.anyChannel))
      announce(`Records on ${chip.label}.`)
    })

    const stopRecording = async ({ stopRecordingNow, removeTitleMatch }) => {
      busy.value = true
      try {
        await api('POST', '/api/epg/cancel-series', {
          series_link_ids: (rule.value.autorecs || []).map((a) => a.seriesLinkId),
          stop_recording_now: stopRecordingNow,
          title_match_id: removeTitleMatch ? rule.value.folder.id : null,
        })
        refreshAfterRecordingChange()
        emit('stopped', `Cancelled the series recording of "${props.show.title}".`)
      } catch (err) {
        fail('Cancel', err)
        stage.value = 'options'
      } finally {
        busy.value = false
      }
    }

    const onFolderChanged = (message) => {
      editingFolder.value = false
      announce(message)
      emit('changed')
    }

    const assignFolder = () => runBusy('Assigning a folder', async () => {
      await api('POST', '/api/shows', { show_pattern: props.show.title, dest_folder: assignDest.value.trim() })
      announce(`Episodes save to ${assignDest.value.trim()}.`)
    })

    const close = async () => {
      await flushRulePatch()
      emit('close')
    }

    onUnmounted(() => {
      if (Object.keys(pendingPatch.value).length) flushRulePatch()
    })

    return {
      stage, keep, lead, lag, removeAds, paused, busy, statusText, guideMatches, searched, adRemovalEnabled,
      mediaRoot, importUnmatched, folders, editingFolder, assignDest, rule, intro, chips, episodeOutcome, adsNote,
      unassignedText, KEEP_OPTIONS, LEAD_OPTIONS, LAG_OPTIONS,
      canStep, keepLabel, paddingLabel, mediaRootPrefix, step, toggleAds, togglePause, canToggle, toggleChannel,
      stopRecording, onFolderChanged, assignFolder, close,
    }
  },
}

const maxOf = (values, fallback) => {
  const known = values.filter((v) => Number.isFinite(v))
  return known.length ? Math.max(...known) : fallback
}

const folderNameFor = (title) => String(title || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
