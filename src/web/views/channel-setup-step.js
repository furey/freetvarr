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
import { usePacedJob, SETUP_POLL_MS, SetupRunList } from '/views/welcome-shared.js'

const holdMusicAudioContext = audioContextOnce(window)

export const ChannelSetupStep = {
  props: {
    tvhUrl: { type: String, default: '' },
    actionInBar: { type: Boolean, default: false },
    startEditing: { type: Boolean, default: false },
  },
  emits: ['state'],
  components: { SetupRunList },
  template: `
    <div class="setup-body">
      <p v-if="!actionInBar" class="setup-hint">{{ intro }}</p>
      <setup-run-list v-if="loading && !status" :steps="LOOKING_STEPS" />

      <div v-else-if="loadError" class="setup-block">
        <p class="setup-hint is-error">{{ loadError }}</p>
        <button type="button" class="setup-quiet-link" @click="refresh">Check again</button>
      </div>

      <template v-else-if="status">
        <template v-if="showSteps">
          <div class="setup-block">
            <setup-run-list :steps="steps">
              <template #extra="{ step }">
                <transition name="hold-music-fade">
                  <span v-if="step.id === 'scan' && step.status === 'running'" class="hold-music">
                    <button type="button" class="hold-music-toggle" @click="toggleMusic"
                      :aria-label="musicToggleLabel" :title="musicToggleLabel">
                      <speaker-icon v-if="musicAudible" /><speaker-muted-icon v-else />
                    </button>
                    <music-notes-icon :class="['hold-music-notes', { 'is-audible': musicAudible }]" />
                  </span>
                </transition>
              </template>
            </setup-run-list>
            <p v-if="waitingForTuner" class="setup-hint">
              Waiting for a free tuner. Live TV or a recording is using them; the scan carries on when one is free.
            </p>
            <p v-else-if="scanStarting" class="setup-hint">{{ scanLine }}</p>
            <div :class="['hold-music-credit', { 'is-audible': musicAudible }]">
              <p class="hold-music-credit-text setup-hint">
                Music: "Local Forecast – Elevator" by Kevin MacLeod (<a href="https://incompetech.com" target="_blank" rel="noopener">incompetech.com</a>), licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>
              </p>
            </div>
          </div>
          <div v-if="result && result.ok" class="setup-block">
            <p v-if="favouritesText" class="setup-hint">{{ favouritesText }}</p>
            <button type="button" class="setup-quiet-link" @click="restart">Scan again</button>
          </div>
          <div v-if="result && !result.ok" class="setup-block">
            <p class="setup-hint is-error">{{ result.error }}</p>
            <p v-if="result.next" class="setup-hint">{{ result.next }}</p>
            <button type="button" class="setup-quiet-link" @click="restart">Try again</button>
          </div>
        </template>

        <div v-else-if="state === 'no-tuner'" class="setup-block">
          <setup-run-list v-if="addressSaved" :steps="[{ id: 'address', label: 'Look for the tuner at ' + addressSaved, status: 'running' }]" />
          <template v-else>
            <p class="setup-hint is-error">No TV tuner found yet.</p>
            <p v-if="dockerVm" class="setup-hint">Docker on a Mac or Windows PC cannot find a network tuner by itself. Enter the tuner's address below.</p>
            <p v-else class="setup-hint">Check that the tuner is on and connected to your network, then press Check again.</p>
            <p v-if="savedAddress" class="setup-hint">TVHeadend looks for a tuner at <span class="setup-mono">{{ savedAddress }}</span>.</p>
            <button v-if="!dockerVm" type="button" class="setup-quiet-link" @click="refresh" :disabled="loading">Check again</button>
          </template>
          <form v-if="addressOpen" class="setup-fields is-two" @submit.prevent="saveAddress">
            <div class="field-row">
              <label class="field-label" for="tuner-address">Tuner address</label>
              <input v-no-autofill id="tuner-address" v-autofocus type="text" inputmode="decimal" class="field-input" v-model="tunerAddress" placeholder="e.g. 192.168.1.50" />
            </div>
            <div v-if="dockerVm" class="field-row">
              <label class="field-label" for="tuner-host-address">This computer's address</label>
              <input v-no-autofill id="tuner-host-address" type="text" inputmode="decimal" class="field-input" v-model="hostAddress" placeholder="e.g. 192.168.1.20" />
            </div>
            <p class="setup-hint is-wide">
              Find the tuner's address in your router's list of devices, or in the tuner's own app.<template v-if="dockerVm"> This computer's address is the one other devices on your network use to reach this Mac or PC.<template v-if="hostGuessed"> Freetvarr guessed it from the address in your browser.</template></template>
            </p>
            <p v-if="addressError" class="setup-hint is-error is-wide">{{ addressError }}</p>
            <div v-if="!actionInBar" class="setup-inline-actions is-wide">
              <button type="submit" class="ui-button ui-button-primary" :disabled="actionDisabled">Use this address</button>
            </div>
          </form>
          <button v-else type="button" class="setup-quiet-link" @click="addressOpen = true">Enter the tuner's address</button>
        </div>

        <div v-else-if="state === 'unsupported-tuner'" class="setup-block">
          <p class="setup-hint">Freetvarr cannot set up this kind of tuner yet. Set up its channels in TVHeadend, then press Check again.</p>
          <button type="button" class="setup-quiet-link" @click="refresh">Check again</button>
        </div>

        <div v-else-if="state === 'has-channels' && !editing" class="setup-block">
          <button type="button" class="setup-quiet-link" @click="editing = true">Scan again</button>
        </div>

        <template v-else>
          <div class="setup-block">
            <h2 class="ui-group-label">Tuners</h2>
            <div class="ui-group">
              <div v-for="t in tuners" :key="t.id" class="ui-group-row">
                <span class="ui-group-row-main"><span class="ui-group-row-title">{{ t.name }}</span></span>
                <toggle-switch :model-value="tunerIds.includes(t.id)"
                  :aria-label="'Use ' + t.name" @update:model-value="toggleTuner(t.id)" />
              </div>
            </div>
          </div>
          <div class="setup-block">
            <h2 class="ui-group-label">Transmitter</h2>
            <div class="setup-fields is-two">
              <div v-if="networks.length" class="field-row is-wide">
                <label class="field-label" for="channel-network">TV network</label>
                <select id="channel-network" class="field-input" v-model="networkId">
                  <option v-for="n in networks" :key="n.id" :value="n.id">{{ transmitterLabel(n.name) }} (existing)</option>
                  <option value="">Scan a transmitter instead</option>
                </select>
              </div>
              <template v-if="!networkId">
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
              </template>
            </div>
            <p class="setup-hint">
              {{ transmitterHint }}
            </p>
            <div v-if="recordingNow" class="ui-banner is-warning"><span class="ui-banner-text">{{ recordingNow }}</span></div>
            <p v-if="applyError" class="setup-hint is-error">{{ applyError }}</p>
            <div v-if="!actionInBar" class="setup-inline-actions">
              <button type="button" class="ui-button ui-button-primary" @click="runAction" :disabled="actionDisabled">{{ actionLabel }}</button>
            </div>
            <a v-if="tvhUrl" class="setup-quiet-link" :href="tvhUrl" target="_blank" rel="noopener">Add channels yourself in TVHeadend</a>
          </div>
        </template>
      </template>
    </div>
  `,
  setup(props, { emit }) {
    const status = ref(null)
    const loading = ref(false)
    const loadError = ref('')
    const editing = ref(props.startEditing)
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

    const actionLabel = computed(() => {
      if (state.value === 'no-tuner') return 'Use this address'
      return channelCount.value ? 'Scan again' : 'Find channels'
    })
    const actionDisabled = computed(() => {
      if (state.value === 'no-tuner') return savingAddress.value || Boolean(addressSaved.value) || !tunerAddress.value
      return !ready.value || starting.value
    })
    const scanningWhat = computed(() => {
      const network = networks.value.find((n) => n.id === networkId.value)
      const transmitter = countryTransmitters.value.find((t) => t.key === transmitterKey.value)
      const name = network?.name || transmitter?.name
      return name ? transmitterLabel(name) : ''
    })
    const intro = computed(() => channelIntro({
      loading: loading.value && !status.value,
      loadError: loadError.value,
      state: state.value,
      editing: editing.value,
      running: showSteps.value && !result.value,
      result: result.value,
      channels: channelCount.value,
      scanningWhat: scanningWhat.value,
      doneText: doneText.value,
    }))
    const transmitterHint = computed(() => [
      !networkId.value && 'Pick the transmitter your antenna points at.',
      !networkId.value && guessed.value && 'Freetvarr guessed it from your time zone.',
      'A scan takes a few minutes. Channels you already have stay, and each frequency is scanned again.',
    ].filter(Boolean).join(' '))
    const favourites = computed(() => (result.value?.ok && result.value.favourites || []).map((f) => f.name))

    watch([running, starting, channelCount, actionShown, actionLabel, actionDisabled, intro, favourites], () => {
      emit('state', {
        busy: running.value || starting.value,
        channels: channelCount.value,
        actionShown: actionShown.value,
        action: actionShown.value ? { label: actionLabel.value, disabled: actionDisabled.value } : null,
        intro: intro.value,
        favourites: favourites.value,
      })
    }, { immediate: true })

    const toggleTuner = (id) => {
      tunerIds.value = tunerIds.value.includes(id)
        ? tunerIds.value.filter((tunerId) => tunerId !== id)
        : [...tunerIds.value, id]
    }

    const runAction = () => (state.value === 'no-tuner' ? saveAddress() : apply())

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
      refresh, apply, restart, saveAddress, toggleTuner, runAction, actionLabel, actionDisabled,
      running, musicAudible, musicToggleLabel, toggleMusic, LOOKING_STEPS, intro, transmitterHint,
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
  return `Favourites: ${names.join(', ')}. To change them, press the channel settings button in the TV guide.`
}

const channelIntro = ({ loading, loadError, state, editing, running, result, channels, scanningWhat, doneText }) => {
  if (loading) return 'Freetvarr checks your tuner first.'
  if (loadError) return 'Freetvarr could not read the tuner settings from TVHeadend.'
  if (running) return `Scanning${scanningWhat ? ` ${scanningWhat}` : ''}. This takes a few minutes; you can leave this page open.`
  if (result?.ok) return doneText
  if (result) return 'The channel scan stopped.'
  if (state === 'no-tuner') return 'Freetvarr needs a TV tuner on your network.'
  if (state === 'unsupported-tuner') return 'Freetvarr found a tuner it cannot set up yet.'
  if (channels && editing) return `TVHeadend has ${channels} channels. Check the tuners and the transmitter, then scan again to add any that are missing.`
  if (state === 'has-channels' && !editing) return `TVHeadend already has ${channels} channels. Press Next to keep them, or scan again to add any that are missing.`
  return 'Freetvarr picked these from your tuner and time zone. Change anything that is wrong, then find channels.'
}

const LOOKING_STEPS = [{ id: 'look', label: 'Look for your tuner', status: 'running' }]

const browserLanAddress = () => {
  const host = window.location.hostname
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.startsWith('127.') ? host : ''
}

const NO_TUNER_RETRY_MS = 15_000
const NO_TUNER_RETRIES = 3
const TUNER_ADDRESS_CHECK_MS = 5000
