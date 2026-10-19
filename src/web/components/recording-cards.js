import { computed } from '/vendor/vue.esm-browser.prod.js'
import { formatMinutes } from '/time-format.js'
import { fmtBytes, seasonEpisodeLabel } from '/shared/format.js'
import { RECORDING_CARDS_MAX } from '/shared/pin-drag.js'
import { recordingNow, recordingCount } from '/shared/recording-now.js'
import { now, fmtClockTz } from '/shared/time.js'

export const RecordingCard = {
  props: ['rec', 'kind'],
  setup(props) {
    const geometry = computed(() => recordingBarGeometry({ rec: props.rec, nowMs: now.value.getTime() }))
    const phaseLabel = computed(() => {
      if (props.rec.phase !== 'programme') return props.rec.phase
      const mins = Math.max(0, Math.ceil((props.rec.stop - now.value.getTime()) / 60_000))
      return `${formatMinutes(mins)} left`
    })
    const liveLine = computed(() => recordingLiveLine(props.rec))
    const metaLine = computed(() =>
      [seasonEpisodeLabel(props.rec), props.rec.episodeTitle].filter(Boolean).join(' · '))
    const stepDetail = computed(() => {
      if (props.rec.failed) return ''
      const current = (props.rec.steps || []).find((st) => st.state !== 'done' && st.detail)
      return current ? `${current.label}: ${current.detail}` : ''
    })
    return { geometry, phaseLabel, liveLine, metaLine, stepDetail, fmtClockTz }
  },
  template: `
    <article :class="['rec-card', { failed: rec.failed }]">
      <programme-image v-if="rec.hasImage" :event-id="rec.programId ?? rec.uuid" variant="rec" :channel-id="rec.channelId" has-logo :title="rec.name" />
      <div class="rec-card-body">
        <div class="rec-card-head">
          <channel-logo class="shrink-0" :channel-id="rec.channelId" has-logo />
          <span class="rec-card-channel">{{ rec.channelName }}</span>
          <span v-if="rec.failed" class="rec-badge failed"><cross-icon /> FAILED</span>
          <span v-else-if="kind === 'active'" class="rec-badge"><span class="led-dot sm live"></span>REC</span>
          <span v-else class="rec-badge ended">ENDED {{ fmtClockTz(rec.endedAt) }}</span>
        </div>
        <div class="rec-card-title">{{ rec.title }}</div>
        <div v-if="metaLine" class="rec-card-meta">{{ metaLine }}</div>
        <template v-if="kind === 'active'">
          <div class="rec-bar" role="progressbar" aria-label="Recording progress"
            :aria-valuenow="Math.round(geometry.fill)" aria-valuemin="0" aria-valuemax="100">
            <span class="rec-bar-pad" :style="{ left: 0, width: geometry.pre + '%' }"></span>
            <span class="rec-bar-pad" :style="{ right: 0, width: geometry.post + '%' }"></span>
            <span class="rec-bar-fill" :style="{ width: geometry.fill + '%' }"></span>
            <span class="rec-bar-shade" :style="{ left: 0, width: Math.min(geometry.pre, geometry.fill) + '%' }"></span>
            <span class="rec-bar-shade" :style="{ left: (100 - geometry.post) + '%', width: Math.max(0, geometry.fill - 100 + geometry.post) + '%' }"></span>
          </div>
          <div class="rec-bar-labels">
            <span>{{ fmtClockTz(rec.startPadded) }}</span>
            <span :class="['rec-phase', rec.phase]">{{ phaseLabel }}</span>
            <span>{{ fmtClockTz(rec.stopPadded) }}</span>
          </div>
          <p class="rec-live">{{ liveLine }}</p>
          <p v-if="rec.failed" class="rec-error">{{ rec.statusText || 'TVHeadend reported an error' }}</p>
        </template>
        <template v-else>
          <p v-if="rec.failed" class="rec-error">{{ rec.statusText || 'Recording failed' }}</p>
          <ol class="rec-steps">
            <li v-for="st in rec.steps" :key="st.key" :class="['rec-step', st.state]">
              <step-mark-icon class="rec-step-mark" :state="st.state" />{{ st.label }}{{ st.percent != null ? ' ' + st.percent + '%' : '' }}
            </li>
          </ol>
          <p v-if="stepDetail" class="rec-card-meta">{{ stepDetail }}</p>
        </template>
      </div>
    </article>
  `,
}

export const RecordingNowPanel = {
  setup() {
    const cards = computed(() => [
      ...recordingNow.value.active.slice(0, RECORDING_CARDS_MAX).map((rec) => ({ rec, kind: 'active' })),
      ...recordingNow.value.journeys.map((rec) => ({ rec, kind: 'journey' })),
    ])
    const title = computed(() => recordingNow.value.active.length ? 'RECORDING NOW' : 'JUST RECORDED')
    const summary = computed(() => recordingCount.value ? `${recordingCount.value} active` : '')
    return { cards, title, summary }
  },
  template: `
    <section v-if="cards.length" class="panel rec-panel">
      <header class="panel-header">
        <span class="panel-heading">
          <span class="panel-title">{{ title }}</span>
          <info-button :title="title" doc="guide/tv-guide#on-the-dashboard">
            <p>One card for each programme TVHeadend is recording now. The orange bar runs from the padded start to the padded stop; the dim ends are the early start and the late finish.</p>
            <p>The line under the bar shows the file size, bitrate, tuner signal, and errors, as TVHeadend reports them.</p>
            <p>When a recording stops, its card steps through <strong>Recorded</strong>, <strong>Importing</strong>, <strong>Finding ads</strong> or <strong>Cutting ads</strong>, and <strong>In Plex</strong>. <strong>Importing</strong> waits for the next sync. The card goes about ten minutes after the last step.</p>
          </info-button>
        </span>
        <span v-if="summary" class="text-xs font-mono uppercase tracking-[0.16em] text-signal-orange">{{ summary }}</span>
      </header>
      <div class="panel-body">
        <transition-group name="rec-card" tag="div" class="rec-grid">
          <recording-card v-for="c in cards" :key="c.kind + '-' + c.rec.uuid" :rec="c.rec" :kind="c.kind" />
        </transition-group>
      </div>
    </section>
  `,
}

const recordingBarGeometry = ({ rec, nowMs }) => {
  const total = rec.stopPadded - rec.startPadded
  if (!(total > 0)) return { pre: 0, post: 0, fill: 0 }
  const share = (ms) => Math.min(100, Math.max(0, (ms / total) * 100))
  return {
    pre: share(rec.start - rec.startPadded),
    post: share(rec.stopPadded - rec.stop),
    fill: share(nowMs - rec.startPadded),
  }
}

const recordingLiveLine = (rec) => {
  const bits = []
  if (rec.filesize) bits.push(fmtBytes(rec.filesize))
  if (rec.bitsPerSecond) bits.push(`${(rec.bitsPerSecond / 1_000_000).toFixed(1)}Mb/s`)
  if (rec.signal != null) bits.push(`signal ${fmtReading(rec.signal, rec.signalUnit)}`)
  if (rec.snr != null) bits.push(`SNR ${fmtReading(rec.snr, rec.snrUnit)}`)
  const errors = (rec.errors || 0) + (rec.dataErrors || 0)
  bits.push(errors ? `${errors} error${errors === 1 ? '' : 's'}` : 'no errors')
  if (rec.continuityErrors) bits.push(`${rec.continuityErrors} CC`)
  return bits.join(' · ')
}

const fmtReading = (value, unit) => unit === '%' ? `${value}%` : `${Number(value).toFixed(1)} ${unit}`
