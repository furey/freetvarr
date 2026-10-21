import { ref, computed, onMounted, onBeforeUnmount, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { useFlash, useMediaQuery } from '/shared/composables.js'
import { holdAtLeast } from '/pending.js'
import { tz, now } from '/shared/time.js'
import { recordingNow, recordingChangeTick, refreshAfterRecordingChange } from '/shared/recording-now.js'
import { localDayNumber } from '/guide-time.js'
import {
  SCHEDULED_SECTIONS,
  groupScheduled,
  recordingNowRows,
  watchingRows,
  scheduledCountOfState,
  weekStrip,
} from '/scheduled-groups.js'
import {
  planTuners,
  tunerRecordingsOf,
  clashById,
  clashRangeText,
  clashSentence,
  tonightTimeline,
} from '/tuner-plan.js'

const REFRESH_MS = 60_000
const EXPECTED_HINT = 'TVHeadend schedules this nearer the time'
const REPEAT_HINT = 'TVHeadend skips repeats of an episode it has already recorded or scheduled'
const WIDE_QUERY = '(min-width: 1024px)'
const WARNING_ICON = '<svg class="scheduled-warning-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>'
const BELL_ICON = '<svg class="scheduled-bell" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"></path></svg>'

const ScheduledWeekDays = {
  props: { days: { type: Array, default: () => [] } },
  emits: ['pick'],
  template: `
    <ol class="scheduled-week-days">
      <li v-for="day in days" :key="day.dayNumber">
        <button type="button" class="scheduled-week-day" :class="{ 'is-today': day.isToday, 'is-empty': !day.count }"
          :disabled="!day.count"
          :aria-label="day.weekday + ' ' + day.date + ', ' + (day.count ? day.count + (day.count === 1 ? ' recording' : ' recordings') : 'nothing scheduled') + (day.hasClash ? ', tuner clash' : '')"
          @click="$emit('pick', day.dayNumber)">
          <span v-if="day.hasClash" class="scheduled-week-clash" aria-hidden="true"></span>
          <span class="scheduled-week-weekday">{{ day.weekday }}</span>
          <span class="scheduled-week-date ui-tabular">{{ day.date }}</span>
          <span class="scheduled-week-count">{{ day.countText }}</span>
        </button>
      </li>
    </ol>
  `,
}

const ScheduledWatching = {
  props: {
    rows: { type: Array, default: () => [] },
    busyKey: { type: String, default: '' },
  },
  emits: ['remove'],
  data: () => ({ openKey: '' }),
  template: `
    <div class="ui-group scheduled-watching">
      <div v-for="row in rows" :key="row.key" :class="['scheduled-watch-item', { 'is-open': openKey === row.key }]">
        <button type="button" class="ui-group-row is-tall scheduled-row scheduled-watch-row" :aria-expanded="String(openKey === row.key)"
          @click="openKey = openKey === row.key ? '' : row.key">
          ${BELL_ICON}
          <span class="ui-group-row-main">
            <span class="ui-group-row-title">{{ row.title }}</span>
            <span class="ui-meta scheduled-meta">{{ row.meta }}</span>
          </span>
          <span v-if="row.unseen" class="ui-count-badge" :aria-label="row.unseen + ' new airings'">{{ row.unseen }}</span>
        </button>
        <div v-if="openKey === row.key" class="drawer-card scheduled-watch-drawer">
          <p class="scheduled-watch-note">Freetvarr lists {{ row.title }} here whenever it is in the TV guide.</p>
          <button type="button" :class="['ui-button', 'ui-button-destructive', { 'is-pending': busyKey === row.key }]"
            :disabled="Boolean(busyKey)" @click="$emit('remove', row)">
            <span v-if="busyKey === row.key" class="spinner" aria-hidden="true"></span>
            {{ busyKey === row.key ? 'Removing…' : 'Remove from watchlist' }}
          </button>
        </div>
      </div>
    </div>
  `,
}

const TunerTimeline = {
  props: {
    timeline: { type: Object, required: true },
    tunerCount: { type: Number, required: true },
    sentences: { type: Array, default: () => [] },
  },
  template: `
    <section class="scheduled-card" aria-labelledby="scheduled-tuners-heading">
      <header class="scheduled-card-head">
        <h2 id="scheduled-tuners-heading" class="scheduled-card-title">{{ timeline.title }}</h2>
        <span class="ui-meta">{{ tunerCount === 1 ? '1 tuner' : tunerCount + ' tuners' }}</span>
      </header>
      <p v-if="timeline.isEmpty" class="ui-meta scheduled-tuners-empty">Nothing records in the next few hours.</p>
      <div v-else class="tuner-timeline">
        <div class="tuner-ticks" aria-hidden="true">
          <span v-for="tick in timeline.ticks" :key="tick.key" class="tuner-tick" :style="{ left: tick.percent + '%' }">{{ tick.label }}</span>
        </div>
        <div class="tuner-grid">
          <div v-for="lane in timeline.lanes" :key="lane.key" class="tuner-lane">
            <span class="tuner-lane-label">{{ lane.label }}</span>
            <span class="tuner-track">
              <span v-for="bar in lane.bars" :key="bar.key" class="tuner-bar" :class="{ 'is-recording': bar.isRecording }"
                :style="{ left: bar.left + '%', width: bar.width + '%' }" :title="bar.title">{{ bar.title }}</span>
            </span>
          </div>
          <div v-for="(bars, index) in timeline.clashLanes" :key="'clash-' + index" class="tuner-lane is-clash">
            <span class="tuner-lane-label">{{ index === 0 ? 'Clash' : '' }}</span>
            <span class="tuner-track">
              <span v-for="bar in bars" :key="bar.key" class="tuner-bar is-clash"
                :style="{ left: bar.left + '%', width: bar.width + '%' }" :title="bar.title">{{ bar.title }}</span>
            </span>
          </div>
          <span v-if="timeline.nowPercent != null" class="tuner-now" aria-hidden="true" :style="{ '--now': timeline.nowPercent }"></span>
        </div>
      </div>
      <p v-for="sentence in sentences" :key="sentence" class="scheduled-tuner-warning">${WARNING_ICON}<span>{{ sentence }}</span></p>
    </section>
  `,
}

export const ScheduledView = {
  components: { ScheduledWeekDays, ScheduledWatching, TunerTimeline },
  template: `
    <div v-page-reveal="{ hold: 2 }" class="ui-page scheduled-page">
      <page-header title="Recordings" subtitle="Everything you have, and everything on its way." subtitle-short="Recorded and coming up." />
      <div class="library-toolbar">
        <recordings-tabs current="scheduled" :scheduled-count="loaded ? count : null" />
      </div>
      <p v-if="actionError" class="ui-banner is-error" role="alert">{{ actionError }}</p>
      <p v-else-if="loadError" class="ui-banner is-error" role="alert">{{ loadError }}</p>
      <p v-else-if="state?.stale" class="ui-banner">TVHeadend is not answering. This is its last known state.</p>
      <list-skeleton v-if="!loaded && !loadError" :rows="6" />
      <div v-else-if="loaded" class="scheduled-layout">
        <div class="scheduled-main">
          <section v-if="!isWide && !isEmpty" class="scheduled-card scheduled-week is-top" aria-label="This week">
            <scheduled-week-days :days="weekDays" @pick="scrollToDay" />
          </section>

          <section v-if="recordingRows.length" class="ui-section" aria-label="Recording now" :data-day="todayNumber">
            <h2 class="ui-group-label">Recording now</h2>
            <div class="ui-group">
              <a v-for="row in recordingRows" :key="row.key" :href="'#/recordings/show/' + row.showKey"
                class="ui-group-row is-tall scheduled-row">
                <span class="scheduled-thumb">
                  <title-art :title="row.title" :src="row.imageProgramId ? '/api/epg/image/' + row.imageProgramId : ''" />
                  <span class="ui-live-badge ui-art-badge">REC</span>
                </span>
                <span class="ui-group-row-main">
                  <span class="ui-group-row-title">{{ row.title }}</span>
                  <span class="ui-meta scheduled-meta">{{ row.meta }}</span>
                  <span class="ui-progress scheduled-progress" role="progressbar" :aria-valuenow="row.percent" aria-valuemin="0" aria-valuemax="100" :aria-label="row.title + ' progress'">
                    <span class="ui-progress-fill" :style="{ width: row.percent + '%' }"></span>
                  </span>
                </span>
              </a>
            </div>
          </section>

          <section v-for="section in visibleSections" :key="section.key" class="ui-section" :aria-label="section.label">
            <h2 class="ui-group-label">{{ section.label }}</h2>
            <div class="ui-group">
              <div v-for="row in section.rows" :key="row.key" class="ui-group-row is-tall scheduled-row"
                :class="{ 'is-off': row.state === 'off' }" :data-day="row.dayNumber">
                <a :href="'#/recordings/show/' + row.showKey" class="scheduled-row-link">
                  <span class="scheduled-time ui-tabular">{{ row.time }}<small>{{ row.day ? row.day + ' ' : '' }}{{ row.period }}</small></span>
                  <span class="scheduled-thumb">
                    <title-art :title="row.title" :src="row.imageProgramId ? '/api/epg/image/' + row.imageProgramId : ''" />
                  </span>
                  <span class="ui-group-row-main">
                    <span class="ui-group-row-title">{{ row.title }}<span v-if="row.state === 'repeat'" class="ui-chip is-warn is-small scheduled-repeat-chip">Repeat</span></span>
                    <span class="ui-meta scheduled-meta">{{ row.meta }}{{ row.state === 'off' ? ' · Skipped' : '' }}</span>
                    <span v-if="row.repeatText" class="scheduled-clash">{{ row.repeatText }}</span>
                    <span v-if="clashTextFor(row)" class="scheduled-clash">${WARNING_ICON}No free tuner {{ clashTextFor(row) }}</span>
                  </span>
                </a>
                <toggle-switch :model-value="row.state !== 'off' && row.state !== 'repeat'"
                  :aria-label="switchLabel(row)"
                  :title="switchHintOf(row)"
                  :disabled="row.state === 'expected' || row.state === 'repeat' || busyIds.has(String(row.programId))"
                  @update:model-value="toggle(row)" />
              </div>
            </div>
          </section>

          <section v-if="!isWide && watching.length" class="ui-section" aria-label="Watchlist">
            <h2 class="ui-group-label">Watchlist</h2>
            <scheduled-watching :rows="watching" :busy-key="removingWatchKey" @remove="removeWatch" />
          </section>

          <section v-if="isEmpty" class="ui-empty" aria-label="Nothing scheduled">
            <h2 class="ui-empty-title">Nothing scheduled. Record from the TV guide.</h2>
            <a href="#/guide" class="ui-button ui-button-primary">Open the TV guide</a>
          </section>
        </div>

        <aside v-if="isWide" class="scheduled-side" aria-label="Week and tuners">
          <section class="scheduled-card scheduled-week" aria-labelledby="scheduled-week-heading">
            <header class="scheduled-card-head">
              <h2 id="scheduled-week-heading" class="scheduled-card-title">This week</h2>
              <span class="ui-meta">{{ count === 1 ? '1 recording' : count + ' recordings' }}</span>
            </header>
            <scheduled-week-days :days="weekDays" @pick="scrollToDay" />
          </section>
          <tuner-timeline v-if="timeline" :timeline="timeline" :tuner-count="plan.tunerCount" :sentences="clashSentences" />
          <section v-if="watching.length" class="scheduled-card" aria-labelledby="scheduled-watching-heading">
            <header class="scheduled-card-head">
              <h2 id="scheduled-watching-heading" class="scheduled-card-title">Watchlist</h2>
            </header>
            <scheduled-watching :rows="watching" :busy-key="removingWatchKey" @remove="removeWatch" />
          </section>
        </aside>
      </div>
    </div>
  `,
  setup() {
    const { flash } = useFlash()
    const state = ref(null)
    const watchlist = ref([])
    const loaded = ref(false)
    const loadError = ref('')
    const actionError = ref('')
    const busyIds = ref(new Set())
    const localSkipped = ref(new Map())
    let refreshTimer = null

    const rawByProgramId = computed(() =>
      new Map((state.value?.upcomingRecordings || []).map((entry) => [String(entry.programId), entry])))

    const activeProgramIds = computed(() => [
      ...(state.value?.activeRecordingIds || []),
      ...recordingNow.value.active.filter((r) => !r.failed).map((r) => r.programId),
    ].filter((id) => id != null))

    const groups = computed(() => groupScheduled({
      upcoming: state.value?.upcomingRecordings || [],
      skipped: [...(state.value?.skippedRecordings || []), ...localSkipped.value.values()],
      repeats: state.value?.repeatRecordings || [],
      activeProgramIds: activeProgramIds.value,
      nowMs: now.value.getTime(),
      timeZone: tz.value,
    }))

    const recordingRows = computed(() =>
      recordingNowRows({ active: recordingNow.value.active, nowMs: now.value.getTime() }))

    const watching = computed(() => watchingRows({ items: watchlist.value, timeZone: tz.value }))

    const visibleSections = computed(() => SCHEDULED_SECTIONS
      .map((section) => ({ ...section, rows: groups.value[section.key] }))
      .filter((section) => section.rows.length))

    const count = computed(() => scheduledCountOfState({
      state: state.value,
      skipped: [...localSkipped.value.values()],
      activeProgramIds: activeProgramIds.value,
      nowMs: now.value.getTime(),
      timeZone: tz.value,
    }))

    const isWide = useMediaQuery(WIDE_QUERY)

    const todayNumber = computed(() => localDayNumber({ ms: now.value.getTime(), timeZone: tz.value }))

    const plan = computed(() => planTuners({
      tunerCount: state.value?.tunerCount,
      recordings: tunerRecordingsOf({
        futureRecordings: state.value?.futureRecordings || [],
        upcoming: state.value?.upcomingRecordings || [],
        seriesTags: state.value?.seriesTags || [],
        skippedIds: [...localSkipped.value.keys()],
      }),
    }))

    const clashes = computed(() => clashById(plan.value))

    const clashTextFor = (row) => {
      const clash = row.state !== 'off' && clashes.value.get(String(row.programId))
      return clash ? clashRangeText({ clash, timeZone: tz.value }) : ''
    }

    const timeline = computed(() =>
      tonightTimeline({ plan: plan.value, nowMs: now.value.getTime(), timeZone: tz.value }))

    const clashSentences = computed(() => (timeline.value?.clashes || [])
      .map((clash) => clashSentence({ clash, timeZone: tz.value })))

    const weekDays = computed(() => weekStrip({
      groups: groups.value,
      recordingNowCount: recordingRows.value.length,
      clashDays: (plan.value?.clashes || []).map((clash) => localDayNumber({ ms: clash.from, timeZone: tz.value })),
      nowMs: now.value.getTime(),
      timeZone: tz.value,
    }))

    const scrollToDay = (dayNumber) => {
      const target = document.querySelector(`.scheduled-main [data-day="${dayNumber}"]`)
      if (!target) return
      const section = target.closest('section')
      const anchor = section?.querySelector('[data-day]') === target || section === target ? section : target
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      anchor.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
    }

    const isEmpty = computed(() =>
      recordingRows.value.length === 0 && visibleSections.value.length === 0 && watching.value.length === 0)

    const loadState = async ({ fresh = false } = {}) => {
      try {
        state.value = await api('GET', fresh ? '/api/epg/state?fresh=1' : '/api/epg/state')
        loadError.value = ''
      } catch (err) {
        if (!state.value) loadError.value = err.message || 'Could not load the schedule.'
      }
      loaded.value = true
    }

    const loadWatchlist = async () => {
      try {
        watchlist.value = (await api('GET', '/api/watchlist'))?.items || []
      } catch {
        watchlist.value = []
      }
    }

    const refresh = ({ fresh = false } = {}) => Promise.all([loadState({ fresh }), loadWatchlist()])

    const removingWatchKey = ref('')
    const removeWatch = async (row) => {
      removingWatchKey.value = row.key
      try {
        await holdAtLeast({ task: () => api('DELETE', `/api/watchlist/${row.id}`) })
        flash({ msg: `Removed "${row.title}" from your watchlist.` })
        await loadWatchlist()
      } catch (err) {
        flash({ msg: `Could not remove from watchlist: ${err.message}`, kind: 'error' })
      } finally {
        removingWatchKey.value = ''
      }
    }

    const setBusy = (programId, busy) => {
      const next = new Set(busyIds.value)
      if (busy) next.add(String(programId))
      else next.delete(String(programId))
      busyIds.value = next
    }

    const skipEpisode = async (row) => {
      const raw = rawByProgramId.value.get(String(row.programId))
      await api('POST', '/api/epg/cancel', { program_id: row.programId })
      if (raw) localSkipped.value = new Map(localSkipped.value).set(String(row.programId), raw)
    }

    const recordEpisode = async (row) => {
      await api('POST', '/api/epg/record', {
        channel_id: row.channelId,
        program_id: row.programId,
        epg_program_id: row.programId,
      })
      const next = new Map(localSkipped.value)
      next.delete(String(row.programId))
      localSkipped.value = next
    }

    const toggle = async (row) => {
      if (row.state === 'expected' || row.state === 'repeat') return
      actionError.value = ''
      setBusy(row.programId, true)
      try {
        if (row.state === 'on') await skipEpisode(row)
        else await recordEpisode(row)
        await loadState({ fresh: true })
        refreshAfterRecordingChange()
      } catch (err) {
        actionError.value = err.message || 'TVHeadend did not accept the change.'
      } finally {
        setBusy(row.programId, false)
      }
    }

    const switchHintOf = (row) => {
      if (row.state === 'expected') return EXPECTED_HINT
      if (row.state === 'repeat') return REPEAT_HINT
      return ''
    }

    const switchLabel = (row) => {
      const when = `${row.title} at ${row.time}${row.period}`
      if (row.state === 'repeat') return `${when} is a repeat and will not record`
      return row.state === 'off' ? `Record ${when}` : `Skip ${when}`
    }

    watch(recordingChangeTick, () => loadState({ fresh: true }))

    onMounted(() => {
      refresh()
      refreshTimer = setInterval(() => refresh(), REFRESH_MS)
    })

    onBeforeUnmount(() => clearInterval(refreshTimer))

    return {
      state, loaded, loadError, actionError, busyIds, recordingRows, visibleSections, watching, removingWatchKey, removeWatch,
      count, isEmpty, toggle, switchLabel, switchHintOf, isWide, todayNumber, plan,
      clashTextFor, timeline, clashSentences, weekDays, scrollToDay,
    }
  },
}
