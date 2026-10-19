import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { transmitterLabel } from '/transmitter-label.js'
import {
  audioContextOnce,
  createHoldMusic,
  holdMusicToggleLabel,
  holdMusicVolume,
  loadHoldMusicMuted,
  saveHoldMusicMuted,
  HOLD_MUSIC_SRC,
} from '/hold-music.js'
import { api } from '/shared/api.js'
import { fmtClockTz } from '/shared/time.js'
import { usePacedJob, SETUP_POLL_MS, secureStepDot } from '/views/welcome-shared.js'

const holdMusicAudioContext = audioContextOnce(window)

export const ChannelSetupStep = {
  props: {
    tvhUrl: { type: String, default: '' },
  },
  emits: ['state'],
  template: `
    <div class="space-y-4">
      <p v-if="loading && !status" class="status-readout busy">Looking for your tuner…</p>

      <div v-else-if="loadError" class="space-y-2">
        <p class="status-readout err">{{ loadError }}</p>
        <button type="button" class="btn" @click="refresh"><refresh-icon /> Check again</button>
      </div>

      <template v-else-if="status">
        <div v-if="showSteps" class="space-y-3">
          <ol class="welcome-steps">
            <li v-for="s in steps" :key="s.id" class="step-row">
              <span class="step-marker">
                <span v-if="s.status === 'running'" class="step-spinner"></span>
                <span v-else :class="['led-dot', 'sm', secureStepDot(s.status)]"></span>
              </span>
              <span :class="s.status === 'pending' ? 'text-ink-mute' : 'text-ink'">
                {{ s.label }}<span v-if="stepDetail(s)" class="text-ink-dim"> · {{ stepDetail(s) }}</span><transition name="hold-music-fade"><span v-if="s.id === 'scan' && s.status === 'running'" class="hold-music">
                  <span aria-hidden="true">·</span>
                  <button type="button" class="hold-music-toggle" @click="toggleMusic"
                    :aria-label="musicToggleLabel" :title="musicToggleLabel">
                    <speaker-icon v-if="musicAudible" /><speaker-muted-icon v-else />
                  </button>
                  <music-notes-icon :class="['hold-music-notes', { 'is-audible': musicAudible }]" />
                </span></transition>
              </span>
            </li>
          </ol>
          <p v-if="waitingForTuner" class="status-readout info">
            Waiting for a free tuner. Live TV or a recording is using them; the scan carries on when one is free.
          </p>
          <p v-else-if="scanStarting" class="status-readout busy">
            {{ scanLine }}
          </p>
          <p v-if="result && result.ok" class="status-readout ok">{{ doneText }}</p>
          <p v-if="favouritesText" class="text-sm text-ink">{{ favouritesText }}</p>
          <button v-if="result && result.ok" type="button" class="btn" @click="restart"><search-icon /> Scan again</button>
          <div v-if="result && !result.ok" class="space-y-2">
            <p class="status-readout err">{{ result.error }}</p>
            <p v-if="result.next" class="text-sm text-ink">{{ result.next }}</p>
            <button type="button" class="btn" @click="restart"><refresh-icon /> Try again</button>
          </div>
        </div>

        <div v-else-if="state === 'no-tuner'" class="space-y-4">
          <p v-if="addressSaved" class="status-readout busy">
            Looking for the tuner at {{ addressSaved }}. This can take a minute.
          </p>
          <div v-else class="space-y-2">
            <p class="status-readout err">No TV tuner found yet.</p>
            <p v-if="dockerVm" class="text-sm text-ink">
              Docker on a Mac or Windows PC cannot find a network tuner by itself. Enter the tuner's address below.
            </p>
            <p v-else class="text-sm text-ink">Check that the tuner is on and connected to your network, then press Check again.</p>
            <p v-if="savedAddress" class="text-sm text-ink-dim">TVHeadend looks for a tuner at {{ savedAddress }}.</p>
            <button v-if="!dockerVm" type="button" class="btn" @click="refresh" :disabled="loading">
              <template v-if="loading">Checking…</template><template v-else><refresh-icon /> Check again</template>
            </button>
          </div>
          <form v-if="addressOpen" class="welcome-subform" @submit.prevent="saveAddress">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="field-row">
                <label class="field-label" for="tuner-address">Tuner address</label>
                <input v-no-autofill id="tuner-address" v-autofocus type="text" inputmode="decimal" class="field-input" v-model="tunerAddress" placeholder="e.g. 192.168.1.50" />
              </div>
              <div v-if="dockerVm" class="field-row">
                <label class="field-label" for="tuner-host-address">This computer's address</label>
                <input v-no-autofill id="tuner-host-address" type="text" inputmode="decimal" class="field-input" v-model="hostAddress" placeholder="e.g. 192.168.1.20" />
              </div>
            </div>
            <p class="text-xs text-ink-dim">
              Find the tuner's address in your router's list of devices, or in the tuner's own app.<template v-if="dockerVm"> This computer's address is the one other devices on your network use to reach this Mac or PC.<template v-if="hostGuessed"> Freetvarr guessed it from the address in your browser.</template></template>
            </p>
            <div class="action-row flex">
              <button type="submit" class="btn btn-primary" :disabled="savingAddress || Boolean(addressSaved) || !tunerAddress">
                <search-icon /> Use this address
              </button>
            </div>
            <p v-if="addressError" class="status-readout err">{{ addressError }}</p>
          </form>
          <button v-else type="button" class="btn-link" @click="addressOpen = true">Enter the tuner's address</button>
        </div>

        <div v-else-if="state === 'unsupported-tuner'" class="space-y-2">
          <p class="text-sm text-ink">Freetvarr cannot set up this kind of tuner yet. Set up its channels in TVHeadend, then press Check again.</p>
          <button type="button" class="btn" @click="refresh"><refresh-icon /> Check again</button>
        </div>

        <div v-else-if="state === 'has-channels' && !editing" class="space-y-2">
          <p class="status-readout ok">TVHeadend already has {{ status.channels }} channels.</p>
          <p class="text-sm text-ink-dim">Press Next to keep them. To add channels that are missing, scan again.</p>
          <button type="button" class="btn" @click="editing = true"><search-icon /> Scan again</button>
        </div>

        <div v-else class="space-y-4">
          <p class="text-ink text-sm leading-relaxed">
            Freetvarr can scan for channels and add them to TVHeadend. Check the choices below, then press Find channels.
          </p>
          <div class="field-row">
            <span class="field-label">Tuners</span>
            <label v-for="t in tuners" :key="t.id" class="welcome-check">
              <input type="checkbox" class="chk" :value="t.id" v-model="tunerIds" />
              {{ t.name }}
            </label>
          </div>
          <div v-if="networks.length" class="field-row">
            <label class="field-label" for="channel-network">TV network</label>
            <select id="channel-network" class="field-input" v-model="networkId">
              <option v-for="n in networks" :key="n.id" :value="n.id">{{ transmitterLabel(n.name) }} (existing)</option>
              <option value="">Scan a transmitter instead</option>
            </select>
          </div>
          <template v-if="!networkId">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="field-row">
                <label class="field-label" for="channel-country">Country</label>
                <select id="channel-country" class="field-input" v-model="country">
                  <option value="">Pick a country</option>
                  <option v-for="c in countries" :key="c.code" :value="c.code">{{ c.name }}</option>
                </select>
              </div>
              <div class="field-row">
                <label class="field-label" for="channel-transmitter">Transmitter</label>
                <select id="channel-transmitter" class="field-input" v-model="transmitterKey" :disabled="!country">
                  <option value="">Pick a transmitter</option>
                  <option v-for="t in countryTransmitters" :key="t.key" :value="t.key">{{ transmitterLabel(t.name) }}</option>
                </select>
              </div>
            </div>
            <p class="text-xs text-ink-dim">
              Pick the transmitter your antenna points at.<template v-if="guessed"> Freetvarr guessed it from your time zone.</template>
            </p>
          </template>
          <p v-if="recordingNow" class="status-readout info">{{ recordingNow }}</p>
          <div class="action-row flex flex-wrap items-center gap-3">
            <button type="button" class="btn btn-primary" @click="apply" :disabled="!ready || starting">
              <search-icon /> Find channels
            </button>
          </div>
          <p v-if="applyError" class="status-readout err">{{ applyError }}</p>
          <p class="text-xs text-ink-mute">A scan takes a few minutes. Freetvarr keeps any channels you already have.</p>
          <manual-option v-if="tvhUrl" :href="tvhUrl" label="Open TVHeadend">
            Scan and add channels yourself in TVHeadend, then come back here.
          </manual-option>
        </div>
      </template>

      <div v-if="showSteps" :class="['hold-music-credit', { 'is-audible': musicAudible }]">
        <p class="hold-music-credit-text text-xs text-ink-dim">
        Music: "Local Forecast – Elevator" by Kevin MacLeod (<a href="https://incompetech.com" target="_blank" rel="noopener">incompetech.com</a>), licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>
        </p>
      </div>
    </div>
  `,
  setup(props, { emit }) {
    const status = ref(null)
    const loading = ref(false)
    const loadError = ref('')
    const editing = ref(false)
    const tunerIds = ref([])
    const networkId = ref('')
    const country = ref('')
    const transmitterKey = ref('')
    const guessed = ref(false)
    const job = ref(null)
    const paced = usePacedJob(job)
    let jobDismissed = false
    const starting = ref(false)
    const applyError = ref('')
    const tunerAddress = ref('')
    const hostAddress = ref('')
    const hostGuessed = ref(false)
    const addressOpen = ref(false)
    const savingAddress = ref(false)
    const addressError = ref('')
    const addressSaved = ref('')
    const musicAudible = ref(false)
    const musicMuted = ref(loadHoldMusicMuted(localStorage))
    const holdMusic = createHoldMusic({
      makeAudio: () => new Audio(HOLD_MUSIC_SRC),
      makeVolume: (audio) => holdMusicVolume({ audio, getContext: holdMusicAudioContext }),
      onAudibleChange: (audible) => { musicAudible.value = audible },
    })
    let pollTimer = null
    let retryTimer = null
    let retries = 0

    const state = computed(() => status.value?.suggestion?.state || '')
    const dockerVm = computed(() => status.value?.dockerVm || null)
    const savedAddress = computed(() => status.value?.tunerAddress?.address || '')
    const tuners = computed(() => status.value?.tuners?.filter((t) =>
      t.deliverySystem === status.value?.suggestion?.deliverySystem?.id) || [])
    const networks = computed(() => status.value?.networks || [])
    const countries = computed(() => status.value?.suggestion?.countries || [])
    const countryTransmitters = computed(() => (status.value?.transmitters || [])
      .filter((t) => t.country === country.value)
      .sort((a, b) => a.name.localeCompare(b.name)))
    const ready = computed(() => tunerIds.value.length > 0 && Boolean(networkId.value || transmitterKey.value))
    const steps = computed(() => paced.shown.value.steps)
    const result = computed(() => paced.shown.value.result)
    const running = computed(() => paced.shown.value.running)
    const showSteps = computed(() => running.value || Boolean(result.value))
    const runningScan = computed(() => (running.value
      ? steps.value.find((s) => s.id === 'scan' && s.status === 'running')?.detail || null
      : null))
    const waitingForTuner = computed(() => Boolean(runningScan.value?.waitingForTuner))
    const scanStarting = computed(() => Boolean(runningScan.value) && !runningScan.value.scanned)
    const scanLine = computed(() => (runningScan.value?.active
      ? 'Scanning. The first channels can take a few minutes.'
      : 'Starting the scan. The first channels can take a minute.'))
    const channelCount = computed(() => status.value?.channels || 0)
    const recordingNow = computed(() => recordingWarning(status.value?.recordingNow || []))
    const doneText = computed(() => channelsAddedText(result.value))
    const favouritesText = computed(() => defaultFavouritesText(result.value))
    const actionShown = computed(() => {
      if (!status.value || loadError.value || showSteps.value) return false
      if (state.value === 'no-tuner') return addressOpen.value
      return state.value !== 'unsupported-tuner' && (state.value !== 'has-channels' || editing.value)
    })

    watch([running, starting, channelCount, actionShown], () => {
      emit('state', {
        busy: running.value || starting.value,
        channels: channelCount.value,
        actionShown: actionShown.value,
      })
    }, { immediate: true })

    watch(country, (curr, prev) => {
      if (prev !== undefined && prev !== '' && curr !== prev) {
        transmitterKey.value = ''
        guessed.value = false
      }
    })

    const prefill = (suggestion) => {
      tunerIds.value = suggestion?.tunerIds || []
      networkId.value = suggestion?.networkId || ''
      country.value = suggestion?.country || ''
      transmitterKey.value = suggestion?.transmitterKey || ''
      guessed.value = Boolean(suggestion?.transmitterKey)
    }

    const prefillAddress = (r) => {
      if (r.dockerVm) addressOpen.value = true
      if (!tunerAddress.value) tunerAddress.value = r.tunerAddress?.address || ''
      if (hostAddress.value) return
      const guess = browserLanAddress()
      hostAddress.value = r.tunerAddress?.hostAddress || guess
      hostGuessed.value = !r.tunerAddress?.hostAddress && Boolean(guess)
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
      clearTimeout(retryTimer)
      try {
        const r = await api('GET', '/api/tvh-setup/status')
        status.value = r
        adoptJob(r.job)
        prefill(r.suggestion)
        if (r.suggestion?.state === 'no-tuner') prefillAddress(r)
        else addressSaved.value = ''
        if (r.suggestion?.state === 'no-tuner' && retries < NO_TUNER_RETRIES) {
          retries += 1
          retryTimer = setTimeout(refresh, NO_TUNER_RETRY_MS)
        } else if (addressSaved.value) {
          addressError.value = `No tuner answered at ${addressSaved.value}. Check the address, then press Use this address again.`
          addressSaved.value = ''
        }
      } catch (err) {
        loadError.value = err.message
      } finally {
        loading.value = false
      }
    }

    const startPolling = () => {
      clearInterval(pollTimer)
      pollTimer = setInterval(async () => {
        const progress = await api('GET', '/api/tvh-setup/progress').catch(() => null)
        if (!progress) return
        job.value = progress
        if (!progress.running) {
          clearInterval(pollTimer)
          if (progress.result?.ok) await refreshCounts()
        }
      }, SETUP_POLL_MS)
    }

    const refreshCounts = async () => {
      const r = await api('GET', '/api/tvh-setup/status').catch(() => null)
      if (r) status.value = r
    }

    const unlockMusicUnlessMuted = () => {
      if (!musicMuted.value) holdMusic.unlock()
    }

    const startMusicUnlessMuted = () => {
      if (!musicMuted.value) holdMusic.start()
    }

    const toggleMusic = () => {
      musicMuted.value = musicAudible.value
      saveHoldMusicMuted(localStorage, musicMuted.value)
      if (musicMuted.value) holdMusic.stop()
      else holdMusic.start()
    }

    const musicToggleLabel = computed(() => holdMusicToggleLabel(musicAudible.value))

    const scanStepRunning = computed(() => steps.value.some((s) => s.id === 'scan' && s.status === 'running'))

    watch(scanStepRunning, (isRunning) => {
      if (isRunning) startMusicUnlessMuted()
      else holdMusic.stop()
    })

    const apply = async () => {
      unlockMusicUnlessMuted()
      starting.value = true
      applyError.value = ''
      try {
        const r = await api('POST', '/api/tvh-setup/apply', {
          tuner_ids: tunerIds.value,
          network_id: networkId.value || null,
          transmitter_key: networkId.value ? null : transmitterKey.value,
        })
        jobDismissed = false
        job.value = { running: true, steps: r.steps, result: null }
        paced.begin()
        startPolling()
      } catch (err) {
        holdMusic.stop()
        applyError.value = err.message
      } finally {
        starting.value = false
      }
    }

    const saveAddress = async () => {
      savingAddress.value = true
      addressError.value = ''
      addressSaved.value = ''
      try {
        const r = await api('POST', '/api/tvh-setup/tuner-address', {
          address: tunerAddress.value,
          host_address: dockerVm.value ? hostAddress.value : null,
        })
        addressSaved.value = r.address
        retries = 0
        retryTimer = setTimeout(refresh, TUNER_ADDRESS_CHECK_MS)
      } catch (err) {
        addressError.value = err.message
      } finally {
        savingAddress.value = false
      }
    }

    const restart = () => {
      jobDismissed = true
      job.value = null
      editing.value = true
      refresh()
    }

    const stepDetail = (s) => scanOrMapDetail(s)

    onMounted(refresh)
    onUnmounted(() => {
      clearInterval(pollTimer)
      clearTimeout(retryTimer)
      holdMusic.stop()
    })

    return {
      transmitterLabel, status, loading, loadError, editing, state, tuners, networks, countries, countryTransmitters,
      tunerIds, networkId, country, transmitterKey, guessed, ready, starting, applyError,
      steps, result, showSteps, waitingForTuner, scanStarting, scanLine, doneText, favouritesText, recordingNow,
      dockerVm, savedAddress, tunerAddress, hostAddress, hostGuessed, addressOpen,
      savingAddress, addressError, addressSaved,
      refresh, apply, restart, stepDetail, secureStepDot, saveAddress,
      running, musicAudible, musicToggleLabel, toggleMusic,
    }
  },
}

const recordingWarning = (recordings) => {
  if (!recordings.length) return ''
  const [first] = recordings
  const until = first.stopMs ? ` until ${fmtClockTz(first.stopMs)}` : ''
  const what = recordings.length === 1 ? first.title : `${recordings.length} programmes`
  return `TVHeadend is recording ${what}${until}. A scan now can cause brief glitches in the recording, so you may want to wait.`
}

const channelsAddedText = (result) => {
  const total = result?.channels || 0
  const added = total - (result?.channelsBefore || 0)
  if (added <= 0) return 'Every channel the scan found is already in TVHeadend.'
  if (added === total) return `Added ${total} channels.`
  return `Added ${added} channels. TVHeadend now has ${total}.`
}

const defaultFavouritesText = (result) => {
  const names = (result?.ok && result.favourites || []).map((f) => f.name)
  if (!names.length) return ''
  return `Favourites: ${names.join(', ')}. To change them, press the channel settings button in the Guide.`
}

const scanOrMapDetail = (step) => {
  const d = step.detail
  if (!d) return ''
  if (step.id === 'scan') {
    if (!d.frequencies) return ''
    return d.scanned ? `${d.scanned} of ${d.frequencies}` : ''
  }
  if (step.id === 'map') {
    if (!d.total) return 'nothing new to add'
    return `${Math.round(((d.ok + d.fail) / d.total) * 100)}% done`
  }
  return ''
}

const browserLanAddress = () => {
  const host = window.location.hostname
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.startsWith('127.') ? host : ''
}

const NO_TUNER_RETRY_MS = 15_000
const NO_TUNER_RETRIES = 3
const TUNER_ADDRESS_CHECK_MS = 5000
