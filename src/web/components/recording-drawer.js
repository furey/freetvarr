import { computed } from '/vendor/vue.esm-browser.prod.js'
import { formatMinutes } from '/time-format.js'
import { fmtBytes } from '/shared/format.js'
import { fmtTime } from '/shared/time.js'
import { sentenceCase } from '/sentence-case.js'

export const RecordingStatus = {
  props: {
    recording: { type: Object, required: true },
    ctx: { type: Object, required: true },
    inline: Boolean,
  },
  template: `
    <div :class="['recording-status', { 'recording-status-inline': inline }]">
      <span :class="['pill-group', inline ? '' : 'stacked']">
        <span :class="['pill', ctx.libraryStatusOf(recording)]">{{ ctx.statusLabel(ctx.libraryStatusOf(recording)) }}</span>
        <span v-if="recording.deleted_from_tvh_at" class="pill not-in-tvh-chip">NOT IN TVHEADEND</span>
      </span>
      <span v-if="recording.error" class="error-details error-details-text recording-status-error">{{ recording.error }}</span>
      <progress-block v-if="ctx.progressPhase(recording) === 'importing'"
        :progress="recording.progress" :caption="ctx.progressCaption(recording)" :bar="true"/>
      <progress-block v-if="ctx.isAdProgress(recording)"
        :progress="recording.progress" :caption="ctx.progressCaption(recording)" :bar="ctx.hasBar(recording)"/>
    </div>
  `,
}

export const RecordingDrawer = {
  props: {
    recording: { type: Object, required: true },
    ctx: { type: Object, required: true },
  },
  template: `
    <div class="recording-drawer">
      <p v-if="recording.synopsis" class="recording-drawer-text is-dim">{{ recording.synopsis }}</p>
      <p v-if="stateNote" class="recording-drawer-text">{{ stateNote }}</p>
      <dl v-if="facts.length" class="sync-facts recording-facts">
        <template v-for="fact in facts" :key="fact.label">
          <dt>{{ fact.label }}</dt><dd>{{ fact.text }}</dd>
        </template>
      </dl>
      <error-diagnosis v-if="recording.error" :error="recording.error" />
      <div v-if="hasActions" class="card-actions">
        <button v-if="recording.playable" type="button" class="btn btn-sm btn-watch" @click="ctx.playRecording(recording)" :title="ctx.playTitle(recording)">
          <play-icon /> Play
        </button>
        <button v-if="ctx.canImport(recording)" type="button" class="btn btn-sm"
          @click="ctx.importRecording(recording)" :disabled="ctx.importingId === recording.recording_id"
          title="Add this recording to the library at the next sync.">
          {{ ctx.importingId === recording.recording_id ? 'Importing…' : ctx.importLabel(recording) }}
        </button>
        <button v-if="ctx.canAdScan(recording)" type="button" class="btn btn-sm"
          @click="ctx.askAdScan(recording)" :disabled="ctx.adScanningId === recording.recording_id || ctx.isAdScanBlocked(recording)"
          :title="ctx.adScanTitle(recording)">
          <ad-scan-icon /> Scan for ads
        </button>
        <button v-if="ctx.canDelete(recording)" type="button" class="btn btn-sm btn-danger"
          @click="ctx.askRemoveFromTvh(recording)" :disabled="ctx.deletingId === recording.recording_id">
          <trash-icon /> Remove from TVHeadend
        </button>
        <button v-else-if="ctx.canRemove(recording)" type="button" class="btn btn-sm btn-danger"
          @click="ctx.askClearRow(recording)" :disabled="ctx.removingId === recording.recording_id" :title="ctx.removeTitle(recording)">
          <cross-icon /> Clear from list
        </button>
      </div>
    </div>
  `,
  setup(props) {
    const stateNote = computed(() => props.ctx.libraryStateTitle(props.recording) || '')
    const facts = computed(() => recordingFacts({ recording: props.recording, ctx: props.ctx }))
    const hasActions = computed(() => {
      const { recording: r, ctx } = props
      return r.playable || ctx.canImport(r) || ctx.canAdScan(r) || ctx.canDelete(r) || ctx.canRemove(r)
    })
    return { stateNote, facts, hasActions }
  },
}

const recordingFacts = ({ recording: r, ctx }) => [
  { label: 'Channel', text: r.channel_name },
  { label: 'Aired', text: r.aired_at ? fmtTime(r.aired_at) : '' },
  { label: 'Length', text: r.duration_s ? formatMinutes(Math.round(r.duration_s / 60)) : '' },
  { label: 'Size', text: r.size ? fmtBytes(r.size) : '' },
  { label: 'Imported', text: r.imported_at ? fmtTime(r.imported_at) : '' },
  { label: 'File', text: r.file_path },
  { label: 'TVHeadend', text: r.deleted_from_tvh_at ? ctx.notInTvhTitle(r) : 'TVHeadend still has its copy.' },
  { label: 'Ads', text: r.ad_status ? [sentenceCase(ctx.adLabel(r.ad_status)), ctx.adTooltip(r)].filter(Boolean).join(' · ') : '' },
  { label: 'Playback', text: ctx.resumeLabel(r) },
].filter((fact) => fact.text)
