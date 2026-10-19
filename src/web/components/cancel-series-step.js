import { ref, computed } from '/vendor/vue.esm-browser.prod.js'

export const CancelSeriesStep = {
  props: {
    title: { type: String, required: true },
    episodeOutcome: { type: String, default: '' },
    titleMatch: { type: Object, default: null },
    busy: { type: Boolean, default: false },
    showBack: { type: Boolean, default: true },
  },
  emits: ['confirm', 'back'],
  template: `
    <div class="cancel-series-step space-y-4">
      <div class="space-y-1">
        <p class="text-sm text-ink">Cancel the series recording of "{{ title }}"?</p>
        <p class="text-xs font-mono text-ink-dim">TVHeadend stops recording new episodes and removes the upcoming ones. Episodes already recorded stay, and so do their files.</p>
      </div>
      <div v-if="episodeOutcome" class="space-y-1">
        <toggle-switch v-model="stopNow">STOP THE EPISODE ON NOW</toggle-switch>
        <p class="text-xs font-mono text-ink-mute">{{ stopNow ? episodeOutcome : 'The episode on now keeps recording to the end.' }}</p>
      </div>
      <div v-if="titleMatch" class="space-y-1">
        <toggle-switch v-model="keepTitleMatch">KEEP TITLE MATCH</toggle-switch>
        <p class="text-xs font-mono text-ink-mute">{{ titleMatchNote }}</p>
      </div>
      <div class="epg-modal-actions flex flex-wrap items-center justify-end gap-2 pt-1">
        <button v-if="showBack" type="button" class="btn mr-auto" @click="$emit('back')" :disabled="busy">KEEP SERIES</button>
        <button type="button" :class="['btn', 'btn-danger', { 'is-busy': busy }]" @click="confirm" :disabled="busy">
          <span class="btn-label">CANCEL SERIES</span>
          <span v-if="busy" class="spinner spinner-overlay"></span>
        </button>
      </div>
    </div>
  `,
  setup(props, { emit }) {
    const stopNow = ref(true)
    const keepTitleMatch = ref(!isTitleMatchFromSeries({ titleMatch: props.titleMatch, title: props.title }))
    const titleMatchNote = computed(() => (keepTitleMatch.value
      ? `Recordings with "${props.titleMatch.show_pattern}" in the title keep saving to ${props.titleMatch.dest_folder} in your TV library. A title match records nothing by itself.`
      : 'Removes the title match. Recordings already imported stay where they are.'))
    const confirm = () => emit('confirm', {
      stopRecordingNow: Boolean(props.episodeOutcome) && stopNow.value,
      removeTitleMatch: Boolean(props.titleMatch) && !keepTitleMatch.value,
    })
    return { stopNow, keepTitleMatch, titleMatchNote, confirm }
  },
}

const isTitleMatchFromSeries = ({ titleMatch, title }) => Boolean(titleMatch)
  && titleMatch.show_pattern.trim().toLowerCase() === String(title || '').trim().toLowerCase()
