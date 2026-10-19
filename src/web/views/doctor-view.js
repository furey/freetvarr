import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { revealStepMs } from '/paced-reveal.js'
import { formatSeconds } from '/time-format.js'
import { api } from '/shared/api.js'
import { DOCS_BASE } from '/shared/constants.js'
import { routeSection, scrollToRouteSection } from '/shared/router.js'
import { fmtClockTz } from '/shared/time.js'
import { wait, prefersReducedMotion } from '/shared/utils.js'

const DOCTOR_GROUPS = [
  { key: 'tvheadend', label: 'TVHEADEND' },
  { key: 'guide',     label: 'GUIDE'     },
  { key: 'storage',   label: 'STORAGE'   },
  { key: 'plex',      label: 'PLEX'      },
  { key: 'syncs',     label: 'SYNCS'     },
  { key: 'live',      label: 'LIVE TV'   },
  { key: 'host',      label: 'HOST'      },
]
const DOCTOR_PILLS = { pass: 'doctor-pass', warn: 'doctor-warn', fail: 'doctor-fail', skip: 'doctor-skip' }
const DOCTOR_STATUS_ORDER = ['fail', 'warn', 'pass', 'skip']
const DOCTOR_PILL_ORDER = ['pass', 'warn', 'fail', 'skip']

const sortDoctorChecks = (checks) => [...checks].sort((a, b) =>
  DOCTOR_STATUS_ORDER.indexOf(a.status) - DOCTOR_STATUS_ORDER.indexOf(b.status))

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
    <div class="view-reveal space-y-6">
      <a href="#/settings/help" class="btn btn-sm no-hover-underline"><arrow-left-icon /> SETTINGS</a>
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">DOCTOR</span>
            <info-button title="DOCTOR" doc="guide/doctor">
              <p>Checks TVHeadend, the guide, the folders, Plex, live TV, and the host, then says what to fix.</p>
              <ul><li><strong>PASS</strong>: nothing to do.</li><li><strong>WARN</strong>: Freetvarr works, but something costs space, guide data, or picture quality.</li><li><strong>FAIL</strong>: something Freetvarr needs is broken. The row says how to fix it.</li><li><strong>SKIP</strong>: the check could not run, usually because an earlier check failed.</li></ul>
              <p><strong>RE-RUN</strong> checks again. Otherwise the results can be up to 15 seconds old.</p>
            </info-button>
          </span>
          <div class="flex items-center gap-3">
            <span v-if="report && !checking" class="text-xs font-mono text-ink-dim">ran {{ ranLabel }}, {{ durationLabel }}</span>
            <button type="button" class="btn btn-sm" @click="load({ fresh: true })" :disabled="checking">
              <template v-if="checking"><doctor-spinner /> CHECKING</template><template v-else><refresh-icon /> RE-RUN</template>
            </button>
          </div>
        </header>
        <div class="panel-body space-y-3">
          <div v-if="checking" class="doctor-progress" role="status">
            <div class="doctor-progress-line">
              <doctor-spinner class="text-signal-orange" />
              <span class="status-readout busy">{{ progressText }}</span>
            </div>
            <div class="progress-track">
              <div :class="['progress-fill', { indeterminate: phase === 'scanning' }]" :style="phase === 'scanning' ? null : { width: progressPercent + '%' }"></div>
            </div>
          </div>
          <div v-if="report" class="pill-group">
            <span v-for="s in summaryPills" :key="s.status" :class="['pill', s.pill, { 'doctor-pill-zero': !s.count }]">{{ s.count }} {{ s.status }}</span>
          </div>
          <p v-if="error" class="status-readout err">Doctor failed: {{ error }}</p>
          <p class="text-sm text-ink-dim leading-relaxed max-w-2xl">
            The Doctor checks TVHeadend, Plex, and the folders Freetvarr uses, then lists what needs fixing.
          </p>
        </div>
      </section>

      <section v-for="g in groups" :key="g.key" :id="'section-' + g.key" class="panel">
        <header class="panel-header">
          <span class="panel-title">{{ g.label }}</span>
        </header>
        <ul class="doctor-list">
          <li v-for="c in g.checks" :key="c.id" :class="['doctor-row', 'doctor-row-' + rowState(c)]">
            <span v-if="rowState(c) === 'resolved'" :class="['pill', 'doctor-pill', pillFor(c.status)]">{{ c.status }}</span>
            <span v-else class="pill doctor-pill doctor-pill-pending" :aria-label="rowState(c) === 'active' ? 'Checking' : 'Waiting'">
              <doctor-spinner v-if="rowState(c) === 'active'" /><template v-else>···</template>
            </span>
            <div class="min-w-0 space-y-1.5">
              <div class="text-sm font-semibold text-ink doctor-row-title">{{ c.title }}</div>
              <template v-if="rowState(c) === 'resolved'">
                <div class="doctor-detail font-mono text-xs text-ink-dim">{{ c.detail }}</div>
                <p v-if="needsFix(c) && c.fix" class="text-sm text-ink leading-relaxed">{{ c.fix }}</p>
                <div v-if="needsFix(c) || c.action" class="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
                  <a v-if="needsFix(c) && c.doc" :href="docsUrl(c.doc)" target="_blank" rel="noopener noreferrer"
                    class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">Read more <external-link-icon /></a>
                  <a v-if="c.action" :href="c.action.href"
                    class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">{{ c.action.label }} <arrow-right-icon /></a>
                </div>
              </template>
              <div v-else class="doctor-placeholder" aria-hidden="true"></div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  `,
  setup() {
    const report = ref(null)
    const checking = ref(false)
    const error = ref('')
    const phase = ref('scanning')
    const revealed = ref(0)
    let runId = 0

    const groups = computed(() => {
      const checks = report.value?.checks || []
      return DOCTOR_GROUPS
        .map((g) => ({ ...g, checks: sortDoctorChecks(checks.filter((c) => c.group === g.key)) }))
        .filter((g) => g.checks.length)
    })

    const orderedChecks = computed(() => groups.value.flatMap((g) => g.checks))
    const revealOrder = computed(() => new Map(orderedChecks.value.map((c, i) => [c.id, i])))

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
    }

    const resolvedChecks = computed(() => orderedChecks.value.slice(0, revealed.value))

    const summaryPills = computed(() => DOCTOR_PILL_ORDER.map((status) => ({
      status,
      pill: DOCTOR_PILLS[status],
      count: resolvedChecks.value.filter((c) => c.status === status).length,
    })))

    const progressPercent = computed(() => {
      const total = orderedChecks.value.length
      return total ? Math.round((revealed.value / total) * 100) : 0
    })

    const progressText = computed(() => (phase.value === 'scanning'
      ? 'Checking TVHeadend, Plex, and the folders…'
      : `Checked ${revealed.value} of ${orderedChecks.value.length}`))

    const ranLabel = computed(() => fmtClockTz(Date.parse(report.value.ranAt)))
    const durationLabel = computed(() => formatSeconds(report.value.durationMs / 1000, 1))

    const pillFor = (status) => DOCTOR_PILLS[status]
    const needsFix = (c) => c.status === 'fail' || c.status === 'warn'
    const docsUrl = (doc) => `${DOCS_BASE}${doc}`

    onMounted(load)
    const stopSectionWatch = watch(routeSection, scrollToRouteSection)
    onUnmounted(() => {
      runId += 1
      stopSectionWatch()
    })

    return {
      report, checking, error, phase, load, groups, rowState, summaryPills,
      progressPercent, progressText, ranLabel, durationLabel, pillFor, needsFix, docsUrl,
    }
  },
}
