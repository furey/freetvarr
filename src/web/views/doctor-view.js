import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import {
  checkedAgoText,
  doctorCheckGroupsOf,
  driveLabelOf,
  healthHeadlineOf,
  lastSyncText,
  nextSyncText,
  storageUsageOf,
  workingSummaryOf,
} from '/health-page.js'
import { revealStepMs } from '/paced-reveal.js'
import { holdAtLeast } from '/pending.js'
import { formatSeconds } from '/time-format.js'
import { api } from '/shared/api.js'
import { useFlash } from '/shared/composables.js'
import { DOCS_BASE } from '/shared/constants.js'
import { health, healthSummary, pollHealth } from '/shared/health.js'
import { routeSection, scrollToRouteSection } from '/shared/router.js'
import { syncStatus, loadSyncStatus, ensureSyncPolling } from '/shared/sync-status.js'
import { fmtClockTz, now } from '/shared/time.js'
import { wait, prefersReducedMotion } from '/shared/utils.js'

const DOCTOR_GROUP_ORDER = ['tvheadend', 'guide', 'storage', 'plex', 'syncs', 'live', 'host']
const DOCTOR_STATUS_ORDER = ['fail', 'warn', 'pass', 'skip']
const DOCTOR_COUNT_WORDS = [
  { status: 'fail', one: 'failed', many: 'failed' },
  { status: 'warn', one: 'warning', many: 'warnings' },
  { status: 'pass', one: 'passed', many: 'passed' },
  { status: 'skip', one: 'skipped', many: 'skipped' },
]
const DOCTOR_STATUS_LABELS = { pass: 'Passed', warn: 'Warning', fail: 'Failed', skip: 'Skipped' }

const sortDoctorChecks = (checks) => [...checks].sort((a, b) =>
  DOCTOR_GROUP_ORDER.indexOf(a.group) - DOCTOR_GROUP_ORDER.indexOf(b.group)
  || DOCTOR_STATUS_ORDER.indexOf(a.status) - DOCTOR_STATUS_ORDER.indexOf(b.status))

const checkTitleOf = ({ group, title }) => (group === 'tvheadend' && !title.includes('TVHeadend')
  ? `TVHeadend ${title.charAt(0).toLowerCase()}${title.slice(1)}`
  : title)

const DOCTOR_SCAN_MIN_MS = 700

export const DoctorSpinner = {
  template: `
    <svg class="doctor-spinner" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <circle class="doctor-spinner-track" cx="8" cy="8" r="6"/>
      <circle class="doctor-spinner-arc" cx="8" cy="8" r="6" pathLength="100" stroke-dasharray="28 72"/>
    </svg>
  `,
}

export const DoctorView = {
  template: `
    <div v-page-reveal class="settings-page health-page">
      <header class="health-header">
        <div class="health-heading">
          <h2 class="settings-page-title">Health</h2>
          <p class="settings-page-intro" aria-live="polite">{{ headlineLine }}</p>
        </div>
        <div class="health-actions">
          <button type="button" :class="['ui-button', 'ui-button-secondary', { 'is-pending': checking }]" @click="runChecks" :disabled="checking" :aria-busy="checking">
            <template v-if="checking"><doctor-spinner /> Checking…</template><template v-else>Run checks</template>
          </button>
          <button type="button" :class="['ui-button', 'ui-button-primary', 'health-sync-button', { 'is-pending': starting || syncRunning }]" @click="syncNow"
            :disabled="starting || syncRunning" :aria-busy="starting || syncRunning">
            <span v-if="syncRunning || starting" class="spinner" aria-hidden="true"></span><refresh-icon v-else />
            {{ syncRunning || starting ? 'Syncing…' : 'Sync now' }}
          </button>
        </div>
      </header>

      <section class="settings-group" aria-labelledby="health-sync-label">
        <h3 id="health-sync-label" class="ui-group-label">Sync</h3>
        <div class="ui-group">
          <div class="ui-group-row">
            <span class="ui-group-row-main">Last sync</span>
            <span class="ui-group-row-value">{{ lastSyncLabel }}</span>
          </div>
          <div class="ui-group-row">
            <span class="ui-group-row-main">Next sync</span>
            <span class="ui-group-row-value" :title="syncStatus.cron ? 'Schedule: ' + syncStatus.cron : null">{{ nextSyncLabel }}</span>
          </div>
          <div class="ui-group-row">
            <span class="ui-group-row-main">Imported, last 7 days</span>
            <span class="ui-group-row-value">{{ importedLabel }}</span>
          </div>
          <a class="ui-group-row" href="#/settings/system/activity">
            <span class="ui-group-row-main">Activity</span>
            <span v-if="syncCountLabel" class="health-row-note">{{ syncCountLabel }}</span>
            <chevron-glyph class="ui-group-row-chevron" />
          </a>
        </div>
      </section>

      <section class="settings-group" aria-labelledby="health-checks-label">
        <div class="settings-group-head">
          <h3 id="health-checks-label" class="ui-group-label">Checks</h3>
          <span v-if="report && !checking" class="health-counts">{{ countsLabel }}</span>
        </div>
        <div v-if="checking" class="health-progress" role="status">
          <div class="health-progress-line"><doctor-spinner /><span>{{ progressText }}</span></div>
          <div class="ui-progress"><div :class="['ui-progress-fill', { 'is-indeterminate': phase === 'scanning' }]" :style="phase === 'scanning' ? null : { width: progressPercent + '%' }"></div></div>
        </div>
        <p v-if="error" class="status-readout err">The checks could not run: {{ error }}</p>
        <div v-if="orderedChecks.length" class="health-check-groups">
          <p v-if="allWorking" class="health-checks-summary">Everything's working</p>
          <div v-for="group in checkGroups" :key="group.key" class="health-check-group">
            <h4 v-if="group.label" class="ui-group-label health-check-group-label">{{ group.label }}</h4>
            <div class="ui-group">
              <button v-if="group.collapsible && !workingExpanded" type="button" class="ui-group-row health-working-toggle"
                aria-expanded="false" @click="workingExpanded = true">
                <span class="health-check-mark"><span class="ui-dot is-ok" aria-hidden="true"></span></span>
                <span class="ui-group-row-main"><span class="ui-group-row-title">{{ workingSummaryOf(group.checks) }}</span></span>
                <disclosure-chevron />
              </button>
              <div v-else v-for="c in group.checks" :key="c.id" :id="anchorFor(c)"
                :class="['ui-group-row', 'health-check', 'is-' + rowState(c), rowState(c) === 'resolved' ? 'is-' + c.status : '']">
                <span class="health-check-mark">
                  <doctor-spinner v-if="rowState(c) === 'active'" />
                  <span v-else-if="rowState(c) === 'resolved'" :class="['ui-dot', dotClassFor(c.status)]" role="img" :aria-label="statusLabelFor(c.status)"></span>
                  <span v-else class="health-check-pending" aria-label="Waiting" role="img"></span>
                </span>
                <span class="ui-group-row-main">
                  <span class="ui-group-row-title">{{ titleOf(c) }}</span>
                  <template v-if="rowState(c) === 'resolved'">
                    <span class="ui-group-row-meta health-check-detail">{{ c.detail }}</span>
                    <span v-if="needsFix(c) && c.fix" class="health-check-fix">{{ c.fix }}</span>
                    <span v-if="(needsFix(c) && c.doc) || c.action" class="health-check-links">
                      <a v-if="c.action" :href="c.action.href">{{ c.action.label }}</a>
                      <a v-if="needsFix(c) && c.doc" :href="docsUrl(c.doc)" target="_blank" rel="noopener noreferrer">Read more <external-link-icon /></a>
                    </span>
                  </template>
                  <span v-else class="health-check-placeholder" aria-hidden="true"></span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="checking" class="ui-group ui-skeleton-surface" aria-hidden="true">
          <div v-for="i in 6" :key="i" class="ui-group-row"><span class="ui-skeleton is-line health-skeleton"></span></div>
        </div>
        <p v-if="report && !checking" class="health-footnote">Ran at {{ ranLabel }} in {{ durationLabel }}.</p>
      </section>

      <section v-if="drives.length" class="settings-group" aria-labelledby="health-storage-label">
        <h3 id="health-storage-label" class="ui-group-label">Storage</h3>
        <div class="ui-group">
          <div v-for="drive in drives" :key="drive.key" class="ui-group-row health-drive">
            <div class="health-drive-line">
              <span class="ui-group-row-main">{{ drive.label }}</span>
              <span class="ui-group-row-value">{{ drive.usage.label }}</span>
            </div>
            <div class="health-drive-bar" role="meter" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="drive.usage.usedPercent"
              :aria-label="drive.label + ': ' + drive.usage.usedPercent + '% used'">
              <span :style="{ width: drive.usage.usedPercent + '%' }"></span>
            </div>
            <span class="ui-mono">{{ drive.path }}</span>
          </div>
        </div>
      </section>
    </div>
  `,
  setup() {
    const { flash, flashUntilSyncDone } = useFlash()
    const report = ref(null)
    const checking = ref(false)
    const error = ref('')
    const phase = ref('scanning')
    const revealed = ref(0)
    const starting = ref(false)
    let runId = 0

    const checkGroups = computed(() => doctorCheckGroupsOf(sortDoctorChecks(report.value?.checks || [])))
    const orderedChecks = computed(() => checkGroups.value.flatMap((group) => group.checks))
    const allWorking = computed(() => checkGroups.value[0]?.key === 'all')
    const workingExpanded = ref(Boolean(routeSection.value))
    const revealOrder = computed(() => new Map(orderedChecks.value.map((c, i) => [c.id, i])))
    const firstOfGroup = computed(() => new Set(DOCTOR_GROUP_ORDER
      .map((group) => orderedChecks.value.find((c) => c.group === group)?.id)
      .filter(Boolean)))

    const rowState = (c) => {
      const index = revealOrder.value.get(c.id)
      if (index < revealed.value) return 'resolved'
      if (phase.value === 'revealing' && index === revealed.value) return 'active'
      return 'pending'
    }

    const isCurrentRun = (id) => id === runId

    const revealRows = async (id) => {
      const total = orderedChecks.value.length
      if (prefersReducedMotion()) {
        revealed.value = total
        return
      }
      const stepMs = revealStepMs(total)
      for (let i = 1; i <= total; i += 1) {
        await wait(stepMs)
        if (!isCurrentRun(id)) return
        revealed.value = i
      }
    }

    const fetchReport = async ({ fresh, id }) => {
      const minimumScan = prefersReducedMotion() ? null : wait(DOCTOR_SCAN_MIN_MS)
      const [result] = await Promise.allSettled([api('GET', `/api/doctor${fresh ? '?fresh=1' : ''}`), minimumScan])
      if (!isCurrentRun(id)) return false
      if (result.status === 'rejected') {
        error.value = result.reason?.message || String(result.reason)
        return false
      }
      report.value = result.value
      return true
    }

    const load = async ({ fresh = false } = {}) => {
      const id = ++runId
      checking.value = true
      error.value = ''
      phase.value = 'scanning'
      revealed.value = 0
      const ok = await fetchReport({ fresh, id })
      if (!isCurrentRun(id)) return
      if (ok) {
        phase.value = 'revealing'
        await scrollToRouteSection()
        await revealRows(id)
        if (!isCurrentRun(id)) return
      } else {
        revealed.value = orderedChecks.value.length
      }
      phase.value = 'done'
      checking.value = false
      pollHealth({ fresh: true })
    }

    const runChecks = () => load({ fresh: true })

    const syncRunning = computed(() => Boolean(syncStatus.value.activeSyncId))

    const syncNow = async () => {
      starting.value = true
      try {
        const r = await holdAtLeast({ task: () => api('POST', '/api/sync') })
        if (r.alreadyRunning) flash({ msg: 'A sync is already running.', kind: 'info' })
        else flashUntilSyncDone({ msg: `Started sync #${r.syncId}.` })
        await loadSyncStatus()
        ensureSyncPolling()
      } catch (err) {
        flash({ msg: `Sync failed to start: ${err.message}`, kind: 'error' })
      } finally {
        starting.value = false
      }
    }

    const counts = computed(() => DOCTOR_COUNT_WORDS
      .map(({ status, one, many }) => {
        const count = orderedChecks.value.filter((c) => c.status === status).length
        return count ? `${count} ${count === 1 ? one : many}` : ''
      })
      .filter(Boolean))
    const countsLabel = computed(() => counts.value.join(' · '))

    const progressPercent = computed(() => {
      const total = orderedChecks.value.length
      return total ? Math.round((revealed.value / total) * 100) : 0
    })

    const progressText = computed(() => (phase.value === 'scanning'
      ? 'Checking TVHeadend, Plex, and the folders…'
      : `Checked ${revealed.value} of ${orderedChecks.value.length}`))

    const summary = computed(() => healthSummary.value)
    const nowMs = computed(() => now.value.getTime())
    const headline = computed(() => (health.value.known ? healthHeadlineOf(health.value) : 'Checking…'))
    const ranAtMs = computed(() => Date.parse(report.value?.ranAt || summary.value?.sources?.doctor?.ranAt || ''))
    const checkedAgo = computed(() => (checking.value ? '' : checkedAgoText({ ranAtMs: ranAtMs.value, nowMs: nowMs.value })))
    const headlineLine = computed(() => [headline.value, checkedAgo.value].filter(Boolean).join(' '))
    const ranLabel = computed(() => fmtClockTz(Date.parse(report.value.ranAt)))
    const durationLabel = computed(() => formatSeconds(report.value.durationMs / 1000, 1))

    const lastSyncLabel = computed(() => {
      if (syncRunning.value) return 'Syncing now'
      if (!summary.value) return '…'
      return lastSyncText({ sync: summary.value.sources?.lastSync, clockOf: fmtClockTz })
    })
    const nextSyncLabel = computed(() => nextSyncText({
      nextRunAtMs: Date.parse(syncStatus.value.nextRunAt || ''),
      nowMs: nowMs.value,
      clockOf: fmtClockTz,
    }))
    const importedLabel = computed(() => String(summary.value?.counts?.importedLast7Days ?? '…'))
    const syncCountLabel = computed(() => {
      const total = summary.value?.counts?.syncs
      if (total == null) return ''
      return `${total} sync${total === 1 ? '' : 's'}`
    })
    const drives = computed(() => {
      const list = summary.value?.storage || []
      return list
        .map((drive) => ({ ...drive, usage: storageUsageOf(drive), label: driveLabelOf({ key: drive.key, count: list.length }) }))
        .filter((drive) => drive.usage)
    })

    const anchorFor = (c) => (firstOfGroup.value.has(c.id) ? `section-${c.group}` : null)
    const titleOf = checkTitleOf
    const dotClassFor = (status) => ({ pass: 'is-ok', warn: 'is-warn', fail: 'is-fail', skip: 'is-skip' })[status]
    const statusLabelFor = (status) => DOCTOR_STATUS_LABELS[status]
    const needsFix = (c) => c.status === 'fail' || c.status === 'warn'
    const docsUrl = (doc) => `${DOCS_BASE}${doc}`

    onMounted(() => {
      load()
      loadSyncStatus()
    })
    const stopSyncWatch = watch(() => syncStatus.value.activeSyncId, (active, previous) => {
      if (previous && !active) pollHealth({ fresh: true })
    })
    const stopSectionWatch = watch(routeSection, scrollToRouteSection)
    onUnmounted(() => {
      runId += 1
      stopSectionWatch()
      stopSyncWatch()
    })

    return {
      report, checking, error, phase, runChecks, orderedChecks, checkGroups, allWorking, workingExpanded,
      workingSummaryOf, rowState, countsLabel,
      progressPercent, progressText, ranLabel, durationLabel, needsFix, docsUrl,
      headlineLine, lastSyncLabel, nextSyncLabel, importedLabel, syncCountLabel, drives,
      syncStatus, syncRunning, starting, syncNow,
      anchorFor, titleOf, dotClassFor, statusLabelFor,
    }
  },
}
