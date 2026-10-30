import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import {
  clientLabelOf, itemStateOf, jobRowOf, logLineOf, recordingRowOf, serverLineOf, sessionRowOf, startedByText, stepStateOf, upNextRowOf,
} from '/activity-rows.js'
import { syncTook } from '/sync-when.js'
import { api } from '/shared/api.js'
import { fmtBytes } from '/shared/format.js'
import { routeSection } from '/shared/router.js'
import { now, tz } from '/shared/time.js'
import { formatClock } from '/time-format.js'
import { SyncsView } from '/views/syncs-view.js'

const FULL_REFRESH_MS = 10_000
const POLL_MS = 2_000
const FINISHED_SHOWN = 5
const STREAM_URL = '/api/activity/stream'

const ActivityIcon = {
  props: { kind: { type: String, required: true } },
  template: `
    <span class="activity-icon">
      <doctor-spinner v-if="kind === 'running'" />
      <sync-status-icon v-else-if="kind === 'ok'" status="ok" />
      <sync-status-icon v-else-if="kind === 'failed'" status="error" />
      <span v-else-if="kind === 'warn'" class="ui-dot is-warn"></span>
      <span v-else-if="kind === 'live'" class="ui-dot is-live"></span>
      <span v-else-if="kind === 'playing'" class="ui-dot is-ok"></span>
      <span v-else class="ui-dot"></span>
    </span>
  `,
}

const ActivityRow = {
  components: { ActivityIcon },
  props: { row: { type: Object, required: true }, open: Boolean },
  emits: ['toggle'],
  template: `
    <div :class="['activity-row', { open }]" tabindex="0" :aria-expanded="String(open)"
      @click="$emit('toggle')" @keydown.enter.self.prevent="$emit('toggle')" @keydown.space.self.prevent="$emit('toggle')">
      <activity-icon :kind="row.icon" />
      <div class="activity-text">
        <p class="activity-title">{{ row.title }}</p>
        <p v-if="row.sub" :class="['activity-sub', row.tone && 'is-' + row.tone]">{{ row.sub }}</p>
      </div>
      <span class="activity-side ui-tabular">{{ row.side }}</span>
      <div v-if="row.percent != null || row.indeterminate" class="activity-bar">
        <div :class="['ui-progress', { 'is-live': row.live }]">
          <span :class="['ui-progress-fill', { 'is-indeterminate': row.indeterminate }]" :style="row.indeterminate ? null : { width: row.percent + '%' }"></span>
        </div>
      </div>
      <div v-if="open" class="activity-drawer drawer-card" @click.stop @keydown.stop><slot /></div>
    </div>
  `,
}

const ActivityGroup = {
  props: { label: { type: String, required: true }, count: { type: [Number, String], default: null } },
  template: `
    <div class="settings-group activity-group">
      <div class="settings-group-head">
        <h3 class="ui-group-label">{{ label }}</h3>
        <span v-if="count" class="settings-group-count">{{ count }}</span>
      </div>
      <div class="ui-group settings-table-card"><slot /></div>
    </div>
  `,
}

const JobDetail = {
  components: { ActivityIcon },
  props: { detail: { type: Object, default: null }, parent: { type: Object, default: null } },
  template: `
    <div v-if="!detail" class="activity-detail"><list-skeleton :rows="3" /></div>
    <div v-else class="activity-detail">
      <template v-if="detail.steps.length">
        <h4 class="activity-detail-label">Steps</h4>
        <ol class="activity-steps">
          <li v-for="(step, i) in detail.steps" :key="i" :class="{ 'is-failed': step.state === 'failed' }">
            <activity-icon :kind="stepStateOf(step)" />
            <span>{{ step.label }}<template v-if="step.state === 'running' && detail.percent != null"> · {{ detail.percent }}%</template></span>
            <span class="activity-step-time ui-tabular">{{ stepTime(step) }}</span>
          </li>
        </ol>
      </template>
      <template v-if="detail.items.length">
        <h4 class="activity-detail-label">Checks</h4>
        <ul class="activity-steps">
          <li v-for="(item, i) in detail.items" :key="i">
            <activity-icon :kind="itemStateOf(item)" />
            <span class="min-w-0">{{ item.label }}<span v-if="item.detail" class="activity-item-detail"> · {{ item.detail }}</span></span>
            <span></span>
          </li>
        </ul>
      </template>
      <h4 class="activity-detail-label">Details</h4>
      <dl class="activity-facts">
        <template v-for="fact in facts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></template>
      </dl>
      <p v-if="detail.error" class="activity-detail-error">{{ detail.error }}</p>
      <template v-if="detail.log.length">
        <h4 class="activity-detail-label">Log</h4>
        <pre class="activity-log">{{ logText }}</pre>
      </template>
      <div v-if="syncHref" class="activity-detail-actions"><a class="btn-link" :href="syncHref">Open sync</a></div>
    </div>
  `,
  setup(props) {
    const stepTime = (step) => {
      if (step.state === 'running') return `${syncTook(now.value.getTime() - step.startedAt)} so far`
      return step.ms == null ? '' : syncTook(step.ms)
    }
    const facts = computed(() => {
      const d = props.detail
      const startedBy = props.parent ? `${props.parent.title}` : startedByText(d.trigger)
      return [
        ...d.facts,
        { label: 'Started', value: formatClock(d.startedAt, tz.value) },
        d.finishedAt ? { label: 'Took', value: syncTook(d.finishedAt - d.startedAt) } : null,
        startedBy ? { label: 'Started by', value: startedBy } : null,
      ].filter(Boolean)
    })
    const logText = computed(() => props.detail.log.map((line) => logLineOf({ line, timeZone: tz.value })).join('\n'))
    const syncHref = computed(() => {
      const syncId = props.detail?.ref?.syncId ?? props.parent?.ref?.syncId
      return syncId ? `#/settings/system/activity/${syncId}` : null
    })
    return { stepTime, facts, logText, syncHref, stepStateOf, itemStateOf }
  },
}

const FactsDetail = {
  props: { facts: { type: Array, required: true } },
  template: `
    <div class="activity-detail">
      <h4 class="activity-detail-label">Details</h4>
      <dl class="activity-facts">
        <template v-for="fact in facts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></template>
      </dl>
    </div>
  `,
}

const ActivityNow = {
  components: { ActivityRow, ActivityGroup, JobDetail, FactsDetail },
  template: `
    <div v-page-reveal class="settings-page activity-now">
      <teleport defer to="#settings-page-info">
        <info-button title="Activity" doc="guide/syncs">
          <p><strong>Now</strong> shows what the server is doing: jobs running, what people are watching, jobs that run next, and jobs that finished in the last 24 hours.</p>
          <p>Press a row to see its steps, details, and log. Failed jobs stay for 7 days.</p>
          <p><strong>Syncs</strong> lists every sync Freetvarr has run, and holds <strong>Sync now</strong>.</p>
        </info-button>
      </teleport>
      <p v-if="serverLine.length" class="activity-meta">
        <template v-for="(part, i) in serverLine" :key="i"><template v-if="i"> · </template>{{ part.before }}<b>{{ part.value }}</b>{{ part.after }}</template>
      </p>
      <div v-if="!loaded" class="ui-group settings-table-card"><list-skeleton :rows="6" /></div>
      <template v-else>
        <activity-group label="Running now" :count="runningRows.length || null">
          <activity-row v-for="row in runningRows" :key="row.id" :row="row" :open="openId === row.id" @toggle="toggle(row)">
            <job-detail v-if="row.kind !== 'recording'" :detail="openDetail" :parent="parentOf(openDetail)" />
            <facts-detail v-else :facts="recordingFacts(row.id)" />
          </activity-row>
          <p v-if="!runningRows.length" class="activity-empty">{{ idleText }}</p>
        </activity-group>
        <activity-group label="Watching now" :count="sessionRows.length || null">
          <activity-row v-for="row in sessionRows" :key="row.id" :row="row" :open="openId === row.id" @toggle="toggle(row)">
            <facts-detail :facts="sessionFacts(row.id)" />
          </activity-row>
          <p v-if="!sessionRows.length" class="activity-empty">No one is watching.</p>
        </activity-group>
        <activity-group v-if="upNextRows.length" label="Up next">
          <div v-for="row in upNextRows" :key="row.id" class="activity-row is-static">
            <span class="activity-icon"><span class="ui-dot"></span></span>
            <div class="activity-text"><p class="activity-title">{{ row.title }}</p><p class="activity-sub">{{ row.sub }}</p></div>
            <span class="activity-side ui-tabular">{{ row.side }}</span>
          </div>
        </activity-group>
        <activity-group label="Finished" :count="finishedRows.length || null">
          <activity-row v-for="row in shownFinished" :key="row.id" :row="row" :open="openId === row.id" @toggle="toggle(row)">
            <job-detail :detail="openDetail" :parent="parentOf(openDetail)" />
          </activity-row>
          <p v-if="!finishedRows.length" class="activity-empty">Nothing has finished in the last 24 hours.</p>
        </activity-group>
        <p class="settings-note">Finished jobs stay for 24 hours; failed ones for 7 days.
          <button v-if="hiddenFinished" type="button" class="btn-link" @click="showAllFinished = true">Show all {{ finishedRows.length }}</button>
        </p>
      </template>
    </div>
  `,
  setup() {
    const data = ref({ running: [], upNext: [], recent: [], recordings: [], sessions: [], server: {} })
    const loaded = ref(false)
    const openId = ref(null)
    const openDetail = ref(null)
    const showAllFinished = ref(false)
    const nowMs = computed(() => now.value.getTime())

    const runningRows = computed(() => [
      ...data.value.running.map((run) => jobRowOf({ run, nowMs: nowMs.value, timeZone: tz.value })),
      ...data.value.recordings.map((recording) => recordingRowOf({ recording, nowMs: nowMs.value, timeZone: tz.value })),
    ])
    const sessionRows = computed(() => data.value.sessions.map((session) => sessionRowOf({ session, nowMs: nowMs.value })))
    const upNextRows = computed(() => data.value.upNext.map((plan) => upNextRowOf({ plan, nowMs: nowMs.value, timeZone: tz.value })))
    const finishedRows = computed(() => data.value.recent.map((run) => jobRowOf({ run, nowMs: nowMs.value, timeZone: tz.value })))
    const shownFinished = computed(() => (showAllFinished.value ? finishedRows.value : finishedRows.value.slice(0, FINISHED_SHOWN)))
    const hiddenFinished = computed(() => finishedRows.value.length - shownFinished.value.length)
    const serverLine = computed(() => serverLineOf(data.value.server))
    const idleText = computed(() => {
      const nextSync = data.value.upNext.find((plan) => plan.kind === 'sync')
      return nextSync ? `Nothing running. The next sync starts at ${formatClock(nextSync.nextAt, tz.value)}.` : 'Nothing running.'
    })

    const allRuns = () => [...data.value.running, ...data.value.recent]
    const parentOf = (detail) => (detail?.parentId ? allRuns().find((run) => run.id === detail.parentId) ?? null : null)

    const recordingFacts = (id) => {
      const recording = data.value.recordings.find((entry) => entry.id === id)
      if (!recording) return []
      return [
        { label: 'Programme', value: [recording.title, recording.episodeTitle].filter(Boolean).join(' · ') },
        { label: 'Channel', value: recording.channelName },
        { label: 'Time', value: `${formatClock(recording.start, tz.value)}–${formatClock(recording.stop, tz.value)}` },
        { label: 'Tuner', value: recording.tuner },
        { label: 'Size so far', value: recording.filesize ? fmtBytes(recording.filesize) : null },
        { label: 'Status', value: recording.statusText },
      ].filter((fact) => fact.value)
    }

    const sessionFacts = (id) => {
      const session = data.value.sessions.find((entry) => `session-${entry.id}` === id)
      if (!session) return []
      return [
        { label: 'Device', value: clientLabelOf(session.client) },
        { label: 'Started', value: formatClock(session.startedAt, tz.value) },
        { label: 'Status', value: session.status },
        { label: 'Video', value: session.videoMode },
        { label: 'Browser', value: session.client },
      ].filter((fact) => fact.value)
    }

    const loadDetail = async (id) => {
      try {
        const detail = await api('GET', `/api/activity/${encodeURIComponent(id)}`)
        if (openId.value === id) openDetail.value = detail
      } catch {
        if (openId.value === id) openId.value = null
      }
    }

    const toggle = (row) => {
      if (openId.value === row.id) {
        openId.value = null
        return
      }
      openId.value = row.id
      openDetail.value = null
      if (isJobRow(row)) loadDetail(row.id)
    }

    const isJobRow = (row) => allRuns().some((run) => run.id === row.id)

    const refresh = async () => {
      try {
        data.value = await api('GET', '/api/activity')
        loaded.value = true
      } catch {}
    }

    const applyJobs = (jobs) => {
      data.value = { ...data.value, running: jobs.running, upNext: jobs.upNext, recent: jobs.recent }
      loaded.value = true
      const open = openId.value
      if (open && jobs.running.some((run) => run.id === open)) loadDetail(open)
    }

    let stream = null
    let fullTimer = null
    let pollTimer = null

    const startPolling = () => {
      if (pollTimer) return
      pollTimer = setInterval(refresh, POLL_MS)
    }

    const openStream = () => {
      if (typeof EventSource !== 'function') return startPolling()
      stream = new EventSource(STREAM_URL)
      stream.addEventListener('jobs', (event) => {
        try {
          applyJobs(JSON.parse(event.data))
        } catch {}
      })
      stream.onerror = () => {
        stream?.close()
        stream = null
        startPolling()
      }
    }

    const stop = () => {
      stream?.close()
      stream = null
      clearInterval(fullTimer)
      clearInterval(pollTimer)
      fullTimer = null
      pollTimer = null
    }

    const start = () => {
      refresh()
      openStream()
      fullTimer = setInterval(refresh, FULL_REFRESH_MS)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    onMounted(() => {
      start()
      document.addEventListener('visibilitychange', onVisibility)
    })
    onUnmounted(() => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    })

    return {
      loaded, openId, openDetail, toggle, parentOf, showAllFinished,
      runningRows, sessionRows, upNextRows, finishedRows, shownFinished, hiddenFinished,
      serverLine, idleText, recordingFacts, sessionFacts,
    }
  },
}

export const ActivityView = {
  components: { ActivityNow, SyncsView },
  template: `
    <div class="activity-shell">
      <ui-segmented tabs class="activity-tabs" :model-value="tab" :options="tabs" aria-label="Activity" />
      <activity-now v-if="tab === 'now'" />
      <syncs-view v-else />
    </div>
  `,
  setup() {
    const tab = computed(() => (!routeSection.value || routeSection.value === 'now' ? 'now' : 'syncs'))
    const tabs = [
      { value: 'now', label: 'Now', href: '#/settings/system/activity' },
      { value: 'syncs', label: 'Syncs', href: '#/settings/system/activity/syncs' },
    ]
    watch(tab, () => window.scrollTo({ top: 0 }))
    return { tab, tabs }
  },
}
