import { ref, computed, onMounted, onBeforeUnmount, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { tz, now } from '/shared/time.js'
import { recordingNow, recordingChangeTick, refreshAfterRecordingChange } from '/shared/recording-now.js'
import {
  SCHEDULED_SECTIONS,
  groupScheduled,
  recordingNowRows,
  watchingRows,
  scheduledCount,
} from '/scheduled-groups.js'

const REFRESH_MS = 60_000
const EXPECTED_HINT = 'TVHeadend schedules this nearer the time'

export const ScheduledView = {
  template: `
    <div class="ui-page scheduled-page">
      <page-header title="Recordings" subtitle="Everything you have, and everything on its way." />
      <recordings-tabs current="scheduled" :scheduled-count="loaded ? count : null" />
      <p v-if="actionError" class="ui-banner is-error" role="alert">{{ actionError }}</p>
      <p v-else-if="loadError" class="ui-banner is-error" role="alert">{{ loadError }}</p>
      <p v-else-if="state?.stale" class="ui-banner">TVHeadend is not answering. This is its last known state.</p>
      <list-skeleton v-if="!loaded && !loadError" :rows="6" />
      <template v-else-if="loaded">
        <section v-if="recordingRows.length" class="ui-section" aria-label="Recording now">
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
            <div v-for="row in section.rows" :key="row.key" class="ui-group-row is-tall scheduled-row" :class="{ 'is-off': row.state === 'off' }">
              <a :href="'#/recordings/show/' + row.showKey" class="scheduled-row-link">
                <span class="scheduled-time ui-tabular">{{ row.time }}<small>{{ row.period }}</small></span>
                <span class="ui-group-row-main">
                  <span class="ui-group-row-title">{{ row.title }}</span>
                  <span class="ui-meta scheduled-meta">{{ row.meta }}</span>
                </span>
              </a>
              <button type="button" class="ui-switch" role="switch"
                :aria-checked="row.state !== 'off' ? 'true' : 'false'"
                :aria-label="switchLabel(row)"
                :title="row.state === 'expected' ? expectedHint : ''"
                :disabled="row.state === 'expected' || busyIds.has(String(row.programId))"
                @click="toggle(row)"></button>
            </div>
          </div>
        </section>

        <section v-if="watching.length" class="ui-section" aria-label="Watching for">
          <h2 class="ui-group-label">Watching for</h2>
          <div class="ui-group">
            <div v-for="row in watching" :key="row.key" class="ui-group-row is-tall scheduled-row">
              <svg class="scheduled-bell" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"></path></svg>
              <span class="ui-group-row-main">
                <span class="ui-group-row-title">{{ row.title }}</span>
                <span class="ui-meta scheduled-meta">{{ row.meta }}</span>
              </span>
              <span v-if="row.unseen" class="ui-count-badge" :aria-label="row.unseen + ' new airings'">{{ row.unseen }}</span>
            </div>
          </div>
        </section>

        <section v-if="isEmpty" class="ui-empty" aria-label="Nothing scheduled">
          <h2 class="ui-empty-title">Nothing scheduled. Record from the Guide.</h2>
          <a href="#/guide" class="ui-button ui-button-primary">Open the Guide</a>
        </section>
      </template>
    </div>
  `,
  setup() {
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

    const count = computed(() => scheduledCount(groups.value))

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
      if (row.state === 'expected') return
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

    const switchLabel = (row) => row.state === 'off'
      ? `Record ${row.title} at ${row.time}${row.period}`
      : `Skip ${row.title} at ${row.time}${row.period}`

    watch(recordingChangeTick, () => loadState({ fresh: true }))

    onMounted(() => {
      refresh()
      refreshTimer = setInterval(() => refresh(), REFRESH_MS)
    })

    onBeforeUnmount(() => clearInterval(refreshTimer))

    return {
      state, loaded, loadError, actionError, busyIds, recordingRows, visibleSections, watching,
      count, isEmpty, toggle, switchLabel, expectedHint: EXPECTED_HINT,
    }
  },
}
