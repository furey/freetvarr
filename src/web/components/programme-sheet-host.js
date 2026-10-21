import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from '/vendor/vue.esm-browser.prod.js'
import { isSwipeDown } from '/mini-player.js'
import { overlayStack } from '/overlay-stack.js'
import {
  SHEET_KEEP_STEPS,
  activeWatchItemFor,
  canStep,
  initialStrengthOf,
  keepLabel,
  pendingActionLabelOf,
  primaryActionOf,
  seasonEpisodeShort,
  sheetMetaLineOf,
  sheetStrengthsFor,
  stepValue,
  strengthLineOf,
} from '/programme-sheet.js'
import { guideChannelOf, listedProgrammeOf } from '/programme-state.js'
import { holdAtLeast } from '/pending.js'
import { findSeriesLink } from '/series-link.js'
import { findHdSimulcast } from '/simulcast.js'
import { recordedMsOf, stopRecordingOutcome } from '/stop-recording.js'
import { canRecordSeriesOf } from '/record-wording.js'
import { repeatNoticeOf } from '/scheduled-groups.js'
import { keepFocusInside } from '/components/ui-sheet.js'
import { useProgrammeRatings } from '/components/programme-ratings.js'
import { api, fetchSettings } from '/shared/api.js'
import { useFlash } from '/shared/composables.js'
import { liveChannelOf, watchLive } from '/shared/live-session.js'
import { makeStatus } from '/shared/path-check.js'
import { live } from '/shared/player-shared.js'
import {
  cellState,
  programmeSheetFor,
  refreshSheetData,
  sheetDataFor,
  isSeriesScheduled,
  libraryDefault,
  loadEpgState,
  loadWatchlist,
  programmeSheetRequest,
  repeatByProgramId,
  scheduledByProgramId,
  seriesLinkSet,
  seriesTags,
  useProgrammeSheet,
  watchItems,
} from '/shared/programme-sheet-store.js'
import { showKeyOf } from '/show-key.js'
import { episodeRecordingFor, stopOutcomeFor } from '/shared/recording-helpers.js'
import { recordingNow, refreshAfterRecordingChange } from '/shared/recording-now.js'
import { route } from '/shared/router.js'
import { showInGuide } from '/shared/store.js'
import { dateFormat, fmtClockTz, now, tz } from '/shared/time.js'

export const ProgrammeSheetHost = {
  template: `
    <teleport to="body">
    <transition name="ui-sheet">
    <div v-if="selected" class="ui-sheet-backdrop programme-sheet-backdrop" @click.self="closeModal">
      <section ref="sheetEl" class="ui-sheet programme-sheet" role="dialog" aria-modal="true" aria-labelledby="programme-sheet-title" tabindex="-1"
        @touchstart.passive="onSwipeStart" @touchend="onSwipeEnd">
        <span class="ui-sheet-grab" aria-hidden="true"></span>
        <div class="programme-sheet-art">
          <programme-image :key="selected.program.program_id" :event-id="selected.program.has_image ? selected.program.program_id : null" variant="hero"
            :channel-id="selectedChannelId" :has-logo="hasChannelLogo(selectedChannelId)"
            :title="selected.program.title" />
          <button type="button" class="ui-icon-button programme-sheet-close" aria-label="Close" @click="closeModal"><close-glyph /></button>
          <programme-art-badges :classification="selected.program.classification" :advice="selected.program.advice || []" :score="ratingScore" :loading="ratingLoading" v-model:open="ratingCardOpen" />
        </div>
        <div class="programme-sheet-heading">
          <h2 id="programme-sheet-title" class="programme-sheet-title">{{ selected.program.title }}</h2>
          <p class="programme-sheet-meta">{{ sheetMeta }}</p>
        </div>
        <p v-if="selected.program.synopsis" class="programme-sheet-synopsis">{{ selected.program.synopsis }}</p>
        <programme-review-card v-if="ratingReview" :key="selected.program.title" :review="ratingReview" />
        <div :class="['programme-sheet-actions', { 'is-ready': sheetReady }]" :aria-busy="String(!sheetReady)">
        <p v-if="selectedRepeatNotice" class="ui-banner is-warning" role="status">{{ selectedRepeatNotice }}</p>
        <p v-else-if="selectedStatusText" class="programme-sheet-status"><span class="ui-dot is-live" aria-hidden="true"></span>{{ selectedStatusText }}</p>
        <p v-else-if="selectedState === 'series'" class="programme-sheet-status"><span class="ui-dot is-live" aria-hidden="true"></span>A series recording in TVHeadend records this show.</p>
        <cancel-series-step v-if="cancelSeriesStep" :title="cancelSeriesStep.title" :episode-outcome="cancelSeriesStep.episodeOutcome"
          :title-match="cancelSeriesStep.titleMatch" :busy="modalBusy" @back="cancelSeriesStep = null" @confirm="cancelSelectedSeries" />
        <template v-else>
          <div v-if="cancelActions.length" class="programme-sheet-cancels">
            <div v-for="action in cancelActions" :key="action.key" class="programme-sheet-cancel">
              <button type="button" :class="['ui-button', 'ui-button-destructive', 'ui-button-block', { 'is-busy': modalAction === action.busyKey, 'is-pending': modalAction === action.busyKey }]"
                :disabled="modalBusy" :aria-busy="modalAction === action.busyKey" @click="action.run">
                <span v-if="modalAction === action.busyKey" class="spinner" aria-hidden="true"></span><stop-icon v-else-if="action.key === 'stop'" />
                {{ modalAction === action.busyKey ? pendingActionLabelOf(action.key) : action.label }}
              </button>
              <p class="programme-sheet-outcome">{{ action.outcome }}</p>
            </div>
          </div>
          <template v-if="sheetStrengths.length">
            <ui-segmented v-if="sheetStrengths.length > 1" fill class="programme-sheet-strengths" aria-label="What to record"
              v-model="sheetStrength" :options="sheetStrengths.map((s) => ({ value: s.key, label: s.label }))" />
            <p v-if="showStrengthLine" class="programme-sheet-line">{{ strengthLine }}</p>
            <div v-if="sheetStrength === 'episode' || sheetStrength === 'series'" class="ui-group programme-sheet-options">
              <padding-rows v-model:lead="leadTime" v-model:lag="lagTime" id-prefix="programme" />
              <div v-if="sheetStrength === 'series'" class="ui-group-row">
                <span class="ui-group-row-main" id="programme-keep-label">Keep</span>
                <span class="ui-stepper" role="group" aria-labelledby="programme-keep-label">
                  <button type="button" class="ui-stepper-button" aria-label="Keep fewer" :disabled="!canStep({ steps: keepSteps, value: episodesToKeep, step: -1 })" @click="episodesToKeep = stepValue({ steps: keepSteps, value: episodesToKeep, step: -1 })">−</button>
                  <span class="ui-stepper-value" aria-live="polite">{{ keepLabel(episodesToKeep) }}</span>
                  <button type="button" class="ui-stepper-button" aria-label="Keep more" :disabled="!canStep({ steps: keepSteps, value: episodesToKeep, step: 1 })" @click="episodesToKeep = stepValue({ steps: keepSteps, value: episodesToKeep, step: 1 })">+</button>
                </span>
              </div>
              <div v-if="sheetStrength === 'series'" class="ui-group-row">
                <span class="ui-group-row-main">
                  <span class="ui-group-row-title">Any channel</span>
                  <span class="ui-group-row-meta">Follow the show if it moves to another channel</span>
                </span>
                <toggle-switch v-model="anyChannel" aria-label="Record on any channel" :title="ANY_CHANNEL_HINT" />
              </div>
            </div>
            <details v-if="sheetStrength === 'episode' || sheetStrength === 'series'" class="programme-sheet-advanced">
              <summary class="ui-disclosure-summary">Advanced</summary>
              <div class="ui-group">
                <div class="ui-group-row">
                  <span class="ui-group-row-main">
                    <span class="ui-group-row-title">Add to library</span>
                    <span class="ui-group-row-meta">{{ libraryNote.text }}<template v-if="libraryNote.changeable"> Change it in <a href="#/settings/system/series">Series rules</a>.</template></span>
                  </span>
                  <toggle-switch v-model="addToLibrary" aria-label="Add to library" />
                </div>
              </div>
            </details>
          </template>
          <p v-if="!sheetStrengths.length && !cancelActions.length" class="programme-sheet-line">This programme has already aired.</p>
          <p v-if="modalStatusText" :class="['programme-sheet-error', modalStatusKind]" role="status">{{ modalStatusText }}</p>
          <div class="ui-sheet-footer programme-sheet-footer">
            <button v-if="canWatchLive" type="button" class="ui-button ui-button-secondary ui-button-block" @click="watchSelected"><tv-icon /> Watch live</button>
            <div class="programme-sheet-buttons">
              <button type="button" class="ui-button ui-button-secondary programme-sheet-dismiss" @click="closeModal">Close</button>
              <button v-if="primaryAction" type="button" :class="['ui-button', 'programme-sheet-primary', primaryClass, { 'is-pending': modalAction === primaryAction.key }]"
                :disabled="modalBusy" :aria-busy="modalAction === primaryAction.key" @click="runPrimaryAction">
                <span v-if="modalAction === primaryAction.key" class="spinner" aria-hidden="true"></span>
                <span v-else-if="primaryAction.tone === 'record'" class="programme-sheet-rec-dot" aria-hidden="true"></span>
                {{ modalAction === primaryAction.key ? pendingActionLabelOf(primaryAction.key) : primaryAction.label }}
              </button>
            </div>
            <button v-if="canShowInGuide" type="button" class="programme-sheet-guide-link" @click="showSelectedInGuide">Show in TV guide <chevron-right-icon /></button>
          </div>
        </template>
        </div>
      </section>
    </div>
    </transition>
    </teleport>

    <teleport to="body">
    <transition name="ui-sheet">
    <div v-if="hdOffer" class="ui-sheet-backdrop programme-sheet-backdrop is-top" @click.self="hdOffer = null">
      <section class="ui-sheet programme-sheet is-compact" role="alertdialog" aria-modal="true" aria-labelledby="hd-offer-title">
        <span class="ui-sheet-grab" aria-hidden="true"></span>
        <header class="ui-sheet-header">
          <h2 id="hd-offer-title" class="ui-sheet-title">This is the SD channel</h2>
          <button type="button" class="ui-icon-button is-plain" aria-label="Close" @click="hdOffer = null"><close-glyph /></button>
        </header>
        <p class="ui-sheet-subtitle">{{ hdOffer.channel.name }} shows the same programme in HD.</p>
        <div class="programme-sheet-buttons">
          <template v-if="hdOffer.action === 'record-series'">
            <button type="button" class="ui-button ui-button-secondary" @click="recordOffered('sd')">Series in SD</button>
            <button type="button" class="ui-button ui-button-record programme-sheet-primary" @click="recordOffered('hd')">Series in HD</button>
          </template>
          <template v-else>
            <button type="button" class="ui-button ui-button-secondary" @click="recordOffered('sd')">Record in SD</button>
            <button type="button" class="ui-button ui-button-record programme-sheet-primary" @click="recordOffered('hd')">Record in HD</button>
          </template>
        </div>
      </section>
    </div>
    </transition>
    </teleport>
  `,
  setup() {
    const { flash } = useFlash()
    const { closeProgramme } = useProgrammeSheet()
    const selected = ref(null)
    const guideDay = shallowRef(null)
    const sheetEl = ref(null)
    const modalBusy = ref(false)
    const modalAction = ref('')
    const [modalStatusText, modalStatusKind, setModalStatus] = makeStatus()
    const sheetStrength = ref('')
    const leadTime = ref(2)
    const lagTime = ref(10)
    const episodesToKeep = ref(0)
    const anyChannel = ref(false)
    const addToLibrary = ref(true)
    const showRules = ref([])
    const moviesFolderSet = ref(false)
    const dialogFocus = ref('')
    const cancelSeriesStep = ref(null)
    const hdOffer = ref(null)
    const dayOffset = ref(0)
    const sheetProgramme = computed(() => selected.value?.program || null)
    const { score: ratingScore, review: ratingReview, cardOpen: ratingCardOpen, loading: ratingLoading } = useProgrammeRatings(sheetProgramme)

    const nowMs = computed(() => Math.floor(now.value.getTime() / 60_000) * 60_000)
    const fmtClock = fmtClockTz
    const fmtSheetRange = (p) => `${dateFormat({ weekday: 'short' }).format(new Date(p.start))} ${fmtClock(p.start)}–${fmtClock(p.end)}`

    const remote = shallowRef(null)
    const channelHint = shallowRef(null)
    const sheetReady = ref(true)

    const remoteChannelOf = (id) => {
      const channel = remote.value?.channel
      return channel && String(channel.id) === String(id) ? channel : null
    }
    const channelById = (id) => guideChannelOf({ guideDay: guideDay.value, channelId: id }) || remoteChannelOf(id)
    const channelName = (id) => channelById(id)?.name || channelHint.value?.name || `channel ${id}`
    const hasChannelLogo = (id) => (channelById(id) ? Boolean(channelById(id).logos?.length) : Boolean(channelHint.value?.hasLogo))

    const selectedChannelId = computed(() => selected.value?.channel?.id ?? selected.value?.program.channelId)

    const loadShowRules = async () => {
      const [r, s] = await Promise.all([
        api('GET', '/api/shows').catch(() => ({ shows: [] })),
        fetchSettings().catch(() => ({})),
      ])
      showRules.value = (r.shows || []).filter((rule) => rule.enabled)
      moviesFolderSet.value = Boolean(s.movies_root)
    }

    const ruleFor = (title) => {
      const t = String(title || '').toLowerCase()
      return showRules.value
        .filter((rule) => t.includes(rule.show_pattern.toLowerCase()))
        .sort((a, b) => b.show_pattern.length - a.show_pattern.length)[0] || null
    }

    const libraryNote = computed(() => {
      const program = selected.value?.program
      if (!program) return { text: '' }
      if (!addToLibrary.value) return { text: 'Stays in TVHeadend. Freetvarr does not import it.' }
      const folder = ruleFor(program.title)
      if (folder) return { text: `Episodes go into ${folder.dest_folder} in your TV library.`, changeable: true }
      if (moviesFolderSet.value && program.kind === 'movie') return { text: 'The guide lists this as a film, so it goes to the movies folder.' }
      if (!program.series_link) return { text: 'Goes to the one-off folder.' }
      return {
        text: 'Record puts this airing in the one-off folder. Record series gives the series its own folder in your TV library.',
        changeable: true,
      }
    })

    const canRecord = computed(() =>
      selected.value && selected.value.program.end > nowMs.value
      && (selected.value.channel?.recordable !== false))

    const canWatchLive = computed(() => {
      const channelId = selectedChannelId.value
      if (!selected.value || channelId == null) return false
      if (live.open && String(live.channel?.id) === String(channelId)) return false
      const { start, end } = selected.value.program
      const t = now.value.getTime()
      return Boolean(start) && start <= t && end > t
    })

    const canShowInGuide = computed(() => route.value !== 'guide')

    const isSelectedOnAir = computed(() => {
      const program = selected.value?.program
      return Boolean(program?.start) && program.start <= nowMs.value && program.end > nowMs.value
    })

    const selectedScheduled = computed(() => (selected.value
      ? scheduledByProgramId.value.get(String(selected.value.program.program_id ?? selected.value.program.programId)) || null
      : null))

    const selectedSeriesLink = computed(() => {
      const program = selected.value?.program
      if (!program) return null
      if (isSeriesScheduled(program)) return String(selectedScheduled.value.seriesLinkId)
      return findSeriesLink({ links: seriesLinkSet.value, seriesLink: program.series_link })
    })

    const selectedRecording = computed(() => {
      const program = selected.value?.program
      if (!program) return null
      const id = String(program.program_id ?? program.programId)
      return recordingNow.value.active.find((r) => !r.failed && String(r.programId) === id) || selectedScheduled.value
    })

    const selectedState = computed(() => (selected.value ? cellState(selected.value.program) : ''))

    const selectedWatchItem = computed(() => (selected.value
      ? activeWatchItemFor({ items: watchItems.value, key: showKeyOf(selected.value.program.title) })
      : null))

    const selectedStatusText = computed(() => {
      const program = selected.value?.program
      const series = isSeriesScheduled(program || {})
      if (selectedState.value === 'recording') {
        return series ? `Recording now as part of the "${program.title}" series recording.` : 'Recording now (one-off recording).'
      }
      if (selectedState.value === 'scheduled') {
        return `Scheduled to record in TVHeadend${series ? ' (part of a series recording).' : ' (one-off recording).'}`
      }
      return ''
    })

    const selectedRepeat = computed(() => (selected.value
      ? repeatByProgramId.value.get(String(selected.value.program.program_id ?? selected.value.program.programId)) || null
      : null))

    const selectedRepeatNotice = computed(() => (selectedState.value === 'repeat'
      ? repeatNoticeOf({ repeatOf: selectedRepeat.value?.repeatOf, timeZone: tz.value })
      : ''))

    const selectedChannelLabel = () => {
      if (anyChannel.value) return 'on any channel'
      const name = selected.value.channel?.name || channelName(selected.value.program.channelId)
      return name ? `on ${name}` : 'on this channel'
    }

    const stopOutcome = () => {
      const recording = selectedRecording.value
      const text = stopRecordingOutcome({
        recordedMs: recordedMsOf({ recordingSince: recording?.recordingSince, nowMs: now.value.getTime() }),
        addsToLibrary: selectedScheduled.value?.libraryChoice !== 'exclude',
      })
      return isSeriesScheduled(selected.value.program) ? `${text} The series keeps recording future episodes.` : text
    }

    const cancelSeriesOutcome = () =>
      `Stops TVHeadend recording new episodes of "${selected.value.program.title}". Asks what to do with the rest.`

    const sheetStrengths = computed(() => {
      const program = selected.value?.program
      if (!program) return []
      const ruled = Boolean(selectedSeriesLink.value) || selectedState.value === 'series'
      return sheetStrengthsFor({
        canRecordEpisode: canRecord.value && selectedState.value === '',
        canRecordSeries: canRecord.value && canRecordSeriesOf(program) && !ruled,
        kind: ruled ? 'series' : program.kind,
      })
    })

    const resetStrength = () => {
      sheetStrength.value = initialStrengthOf({ strengths: sheetStrengths.value, focus: dialogFocus.value })
    }

    watch(() => sheetStrengths.value.map((s) => s.key).join(), () => {
      if (!sheetStrengths.value.some((s) => s.key === sheetStrength.value)) resetStrength()
    })

    const strengthLine = computed(() => {
      const program = selected.value?.program
      if (!program) return ''
      return strengthLineOf({
        strength: sheetStrength.value,
        title: program.title,
        channelLabel: selectedChannelLabel(),
        onAirUntil: isSelectedOnAir.value ? fmtClock(program.end) : '',
        kind: program.kind,
      })
    })

    const showStrengthLine = computed(() => Boolean(strengthLine.value)
      && (sheetStrengths.value.length > 1 || isSelectedOnAir.value))

    const primaryAction = computed(() => (cancelSeriesStep.value
      ? null
      : primaryActionOf({ strength: sheetStrength.value })))

    const primaryClass = computed(() => ({
      record: 'ui-button-record',
    })[primaryAction.value?.tone] || '')

    const sheetMeta = computed(() => {
      const program = selected.value?.program
      if (!program) return ''
      return sheetMetaLineOf({
        seasonEpisode: seasonEpisodeShort(program),
        episodeTitle: program.episode_title,
        channelName: selected.value.channel?.name || channelName(program.channelId),
        timeRange: program.start ? fmtSheetRange(program) : '',
      })
    })

    const cancelActions = computed(() => {
      const program = selected.value?.program
      if (!program || program.past || cancelSeriesStep.value) return []
      const state = selectedState.value
      const hasSeries = Boolean(selectedSeriesLink.value)
      const cancelSeriesAction = {
        key: 'cancel-series', busyKey: 'cancel-series', label: 'Cancel series',
        outcome: cancelSeriesOutcome(), run: openCancelSeriesStep,
      }
      if (state === 'recording') {
        return [
          { key: 'stop', busyKey: 'cancel', label: 'Stop recording', outcome: stopOutcome(), run: cancelSelected },
          hasSeries && cancelSeriesAction,
        ].filter(Boolean)
      }
      if (state === 'scheduled') {
        return [
          {
            key: 'cancel', busyKey: 'cancel',
            label: isSeriesScheduled(program) ? 'Skip this episode' : 'Cancel recording',
            outcome: isSeriesScheduled(program) ? 'Skips this episode. The series keeps recording the others.' : 'Removes this recording from the schedule.',
            run: cancelSelected,
          },
          hasSeries && cancelSeriesAction,
        ].filter(Boolean)
      }
      if (state === 'series') return [cancelSeriesAction]
      if (state === 'repeat') return hasSeries ? [cancelSeriesAction] : []
      if (selectedWatchItem.value) {
        return [{
          key: 'remove-watch', busyKey: 'remove-watch', label: 'Remove from watchlist',
          outcome: 'Takes it off your watchlist in Scheduled.', run: removeSelectedWatch,
        }]
      }
      return []
    })

    const removeSelectedWatch = () => {
      const item = selectedWatchItem.value
      if (!item) return
      return runSheetAction({
        key: 'remove-watch',
        failure: 'Could not remove from watchlist',
        task: async () => {
          await holdAtLeast({ task: () => api('DELETE', `/api/watchlist/${item.id}`) })
          flash({ msg: `Removed "${item.title}" from your watchlist.` })
          await loadWatchlist()
        },
      })
    }

    const runPrimaryAction = () => {
      const key = primaryAction.value?.key
      if (key === 'record') return recordSelected()
      if (key === 'record-series') return recordSelectedSeries()
    }

    const openCancelSeriesStep = () => {
      const { program } = selected.value
      const link = selectedSeriesLink.value ?? program.series_link
      const autorec = seriesTags.value.find((t) => String(t.seriesLinkId) === String(link))
      cancelSeriesStep.value = {
        link,
        title: autorec?.name || program.title,
        episodeOutcome: stopOutcomeFor(episodeRecordingFor([autorec?.id])),
        titleMatch: ruleFor(autorec?.name || program.title),
      }
    }

    const watchSelected = () => {
      const { program, channel } = selected.value
      const channelId = selectedChannelId.value
      const liveChannel = channel
        ? liveChannelOf(channel)
        : { id: channelId, name: channelName(channelId), number: null, hasLogo: hasChannelLogo(channelId) }
      closeModal()
      watchLive({ channel: liveChannel, nowTitle: program.title })
    }

    const showSelectedInGuide = () => {
      const { program } = selected.value
      const channelId = selectedChannelId.value
      const day = dayOffset.value
      closeModal({ refocus: false })
      showInGuide({ channelId, dayOffset: day, atMs: program.start })
    }

    let layerId = null
    let sheetReturnFocus = null

    const holdLayer = () => {
      if (layerId == null) layerId = overlayStack.push({ onBack: () => closeModal() }).id
    }

    const releaseLayer = () => {
      if (layerId == null) return
      overlayStack.remove(layerId)
      layerId = null
    }

    watch(() => Boolean(selected.value), (open) => {
      try { document.body.classList.toggle('sheet-open', open || overlayStack.size() > 0) } catch { /* ignore */ }
    }, { flush: 'post' })

    const showProgramme = ({ program, channel, focus = '' }) => {
      leadTime.value = 2
      lagTime.value = 10
      episodesToKeep.value = 0
      anyChannel.value = false
      addToLibrary.value = libraryDefault.value
      cancelSeriesStep.value = null
      dialogFocus.value = focus
      modalAction.value = ''
      setModalStatus('')
      if (!selected.value) sheetReturnFocus = document.activeElement
      selected.value = { program, channel }
      holdLayer()
      resetStrength()
      loadShowRules()
      nextTick(() => sheetEl.value?.focus())
    }

    const listedOrGiven = (request) => ({
      program: listedProgrammeOf({ guideDay: guideDay.value, channelId: request.channelId, programme: request.programme }) || request.programme,
      channel: request.channel ?? channelById(request.channelId),
    })

    const loadContextFor = async (request) => {
      const [sheet] = await Promise.all([
        programmeSheetFor({ channelId: request.channelId, startMs: request.programme.start }).catch(() => null),
        sheetDataFor({ freshState: request.freshState }),
      ])
      return sheet
    }

    const isCurrent = (request) => programmeSheetRequest.value === request

    const applyContext = (request, sheet) => {
      remote.value = sheet
      if (!sheet?.programme) return
      selected.value = { program: { ...request.programme, ...sheet.programme }, channel: sheet.channel }
    }

    const markReady = () => {
      addToLibrary.value = libraryDefault.value
      resetStrength()
      sheetReady.value = true
    }

    const openRequest = async (request) => {
      if (!request) return
      dayOffset.value = request.dayOffset
      channelHint.value = request.channelHint
      remote.value = null
      if (request.guideDay) {
        guideDay.value = request.guideDay
        sheetReady.value = true
        return showProgramme({ ...listedOrGiven(request), focus: request.focus })
      }
      guideDay.value = null
      sheetReady.value = false
      showProgramme({ program: request.programme, channel: null, focus: request.focus })
      const context = loadContextFor(request).then((sheet) => {
        if (isCurrent(request) && selected.value) applyContext(request, sheet)
      })
      await Promise.race([context, new Promise((resolve) => { setTimeout(resolve, READY_WAIT_MS) })])
      if (isCurrent(request) && selected.value && !sheetReady.value) markReady()
    }

    watch(programmeSheetRequest, openRequest)

    const closeModal = ({ refocus = true } = {}) => {
      cancelSeriesStep.value = null
      dialogFocus.value = ''
      hdOffer.value = null
      selected.value = null
      releaseLayer()
      closeProgramme()
      if (refocus) sheetReturnFocus?.focus?.()
      sheetReturnFocus = null
    }

    const remoteHdTwin = (action) => {
      const sheet = remote.value
      if (sheet?.programme?.program_id !== selected.value.program.program_id) return null
      return (action === 'record-series' ? sheet.hdSeries : sheet.hdEpisode) || null
    }

    const offerHdFirst = (action) => {
      const { program, channel } = selected.value
      const hd = guideDay.value ? findHdSimulcast({
        program,
        channelId: channel?.id ?? program.channelId,
        channels: guideDay.value?.channels,
        programsByChannel: guideDay.value?.programs,
        needsSeriesLink: action === 'record-series',
      }) : remoteHdTwin(action)
      if (!hd || cellState(hd.program)) return false
      hdOffer.value = { action, ...hd }
      return true
    }

    const recordOffered = (choice) => {
      const { action, program, channel } = hdOffer.value
      hdOffer.value = null
      if (choice === 'hd') selected.value = { program, channel }
      return action === 'record-series' ? recordSeries() : recordOneOff()
    }

    const recordSelected = () => offerHdFirst('record') || recordOneOff()

    const recordSelectedSeries = () => (!anyChannel.value && offerHdFirst('record-series')) || recordSeries()

    const runSheetAction = async ({ key, task, failure }) => {
      modalBusy.value = true
      modalAction.value = key
      try {
        await task()
      } catch (err) {
        setModalStatus(`${failure}: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ''
      }
    }

    const afterRecordingChange = async () => {
      closeModal()
      refreshAfterRecordingChange()
      await loadEpgState({ fresh: true })
    }

    const recordOneOff = () => {
      const { program, channel } = selected.value
      return runSheetAction({
        key: 'record',
        failure: 'Record failed',
        task: async () => {
          await holdAtLeast({ task: () => api('POST', '/api/epg/record', {
            channel_id: channel?.id ?? program.channelId,
            program_id: program.program_id,
            epg_program_id: program.epg_program_id,
            lead_time: leadTime.value,
            lag_time: lagTime.value,
            add_to_library: addToLibrary.value,
          }) })
          flash({ msg: `Scheduled "${program.title}".` })
          await afterRecordingChange()
        },
      })
    }

    const recordSeries = () => {
      const { program, channel } = selected.value
      return runSheetAction({
        key: 'record-series',
        failure: 'Series record failed',
        task: async () => {
          const result = await holdAtLeast({ task: () => api('POST', '/api/epg/record-series', {
            series_link: program.series_link,
            channel_id: channel?.id ?? program.channelId,
            program_id: program.program_id,
            epg_program_id: program.epg_program_id,
            lead_time: leadTime.value,
            lag_time: lagTime.value,
            episodes_to_keep: episodesToKeep.value,
            any_channel: anyChannel.value,
            add_show_rule: addToLibrary.value,
          }) })
          const ruleNote = result.showRule ? ` Episodes go into ${result.showRule.dest_folder}.` : ''
          flash({ msg: `Series recording set for "${program.title}".${ruleNote}` })
          await afterRecordingChange()
        },
      })
    }

    const cancelledMessage = ({ title, result }) => {
      if (result?.kept === true) return `Stopped "${title}". What it recorded stays.`
      if (result?.kept === false) return `Stopped "${title}" and deleted what it recorded.`
      return `Cancelled "${title}".`
    }

    const cancelSelected = () => {
      const { program } = selected.value
      return runSheetAction({
        key: 'cancel',
        failure: 'Cancel failed',
        task: async () => {
          const result = await holdAtLeast({ task: () => api('POST', '/api/epg/cancel', { program_id: program.program_id }) })
          flash({ msg: cancelledMessage({ title: program.title, result }) })
          await afterRecordingChange()
        },
      })
    }

    const cancelSelectedSeries = ({ stopRecordingNow, removeTitleMatch }) => {
      const step = cancelSeriesStep.value
      return runSheetAction({
        key: 'cancel-series',
        failure: 'Cancel failed',
        task: async () => {
          try {
            await holdAtLeast({ task: () => api('POST', '/api/epg/cancel-series', {
              series_link_id: step.link,
              stop_recording_now: stopRecordingNow,
              title_match_id: removeTitleMatch ? step.titleMatch.id : null,
            }) })
          } catch (err) {
            cancelSeriesStep.value = null
            throw err
          }
          flash({ msg: `Cancelled the series recording of "${step.title}".` })
          await Promise.all([afterRecordingChange(), loadShowRules()])
        },
      })
    }

    const swipe = { start: null }

    const onSwipeStart = (e) => {
      const touch = e.touches[0]
      swipe.start = e.touches.length === 1 && (sheetEl.value?.scrollTop ?? 0) <= 0
        ? { x: touch.clientX, y: touch.clientY, at: Date.now() }
        : null
    }

    const onSwipeEnd = (e) => {
      const from = swipe.start
      swipe.start = null
      const touch = e.changedTouches[0]
      if (!from || !touch || modalBusy.value) return
      if (isSwipeDown({ startX: from.x, startY: from.y, endX: touch.clientX, endY: touch.clientY, ms: Date.now() - from.at })) closeModal()
    }

    const onKeydown = (e) => {
      if (!selected.value || (layerId != null && !overlayStack.isTop(layerId))) return
      if (e.key === 'Tab' && !hdOffer.value && sheetEl.value) return keepFocusInside({ event: e, root: sheetEl.value })
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.preventDefault()
      if (hdOffer.value) hdOffer.value = null
      else if (ratingCardOpen.value) ratingCardOpen.value = false
      else closeModal()
    }

    const closeOnRouteChange = () => {
      if (selected.value) closeModal({ refocus: false })
      else if (programmeSheetRequest.value) closeProgramme()
    }

    onMounted(() => {
      setTimeout(() => refreshSheetData(), PRELOAD_DELAY_MS)
      window.addEventListener('keydown', onKeydown, true)
      window.addEventListener('hashchange', closeOnRouteChange)
    })
    onUnmounted(() => {
      window.removeEventListener('keydown', onKeydown, true)
      window.removeEventListener('hashchange', closeOnRouteChange)
      releaseLayer()
    })

    return {
      pendingActionLabelOf, ANY_CHANNEL_HINT,
      selected, selectedChannelId, sheetEl, closeModal, modalBusy, modalAction,
      canWatchLive, watchSelected, canShowInGuide, showSelectedInGuide,
      modalStatusText, modalStatusKind,
      leadTime, lagTime, episodesToKeep, anyChannel, addToLibrary, libraryNote,
      keepSteps: SHEET_KEEP_STEPS,
      stepValue, canStep, keepLabel,
      sheetStrengths, sheetStrength, strengthLine, showStrengthLine, primaryAction, primaryClass, runPrimaryAction,
      sheetMeta, cancelActions, selectedState, selectedStatusText, selectedRepeatNotice,
      hdOffer, recordOffered, cancelSelectedSeries, cancelSeriesStep,
      hasChannelLogo, onSwipeStart, onSwipeEnd, sheetReady,
      ratingScore, ratingReview, ratingCardOpen, ratingLoading,
    }
  },
}

const READY_WAIT_MS = 1500
const PRELOAD_DELAY_MS = 2000

const ANY_CHANNEL_HINT = 'Records this series whichever channel airs it, for example when it moves from 7 to 7mate. Episodes it already has are not recorded again.'
